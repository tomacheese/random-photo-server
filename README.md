# random-photo-server

A web server that picks a random image from `photos/`, resizes and compresses it, and serves it.
It is hosted at `https://vrps.tomacheese.com` and is mainly used by photo frames placed in VRChat worlds.

## How it works

- On startup, the server scans `photos/` and stores resized, compressed images (via `sharp`) in `cache/`. `cache/manifest.json` tracks what has already been processed.
- After startup, it keeps watching `photos/` with `chokidar` and updates `cache/` when photos are added, changed or removed.
- Network mounts such as Azure File Share do not deliver filesystem events, so the server also rescans `photos/` every `RESCAN_INTERVAL_SEC` seconds and applies the differences to `cache/` (`0` disables this).
- `photos/` is never exposed over HTTP. Only generated files in `cache/` are served.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Returns a random cached image. Avoids recently served photos per client IP |
| GET | `/portrait` | Returns a random portrait image. Near-square images (aspect ratio 0.95 to 1.05) are excluded. The per-IP recent-photo avoidance is shared with `/` |
| GET | `/landscape` | Returns a random landscape image. Near-square images (aspect ratio 0.95 to 1.05) are excluded. The per-IP recent-photo avoidance is shared with `/` |
| GET | `/portrait/{photoframeId}` | Returns one portrait image chosen deterministically from the request time and `photoframeId` (a non-negative integer). The time is floored to a `BUCKET_WIDTH_SEC` bucket, so the same `photoframeId` gets the same image within a bucket. Used to keep multiple photo frames in sync |
| GET | `/landscape/{photoframeId}` | Landscape version of `/portrait/{photoframeId}` |
| GET | `/photos` | HTML page listing thumbnails of the cached images. Filter with `?orientation=portrait` or `?orientation=landscape` |
| GET | `/photos/:id` | Returns the image whose identifier (as shown by `/photos`) is `id` |
| GET | `/health` | Health check returning whether the cache is ready and the number of cached photos |

Image endpoints respond with `503` while the cache is not ready or has no matching photos.

## Environment variables

| Name | Default | Description |
|---|---|---|
| `API_HOST` | `0.0.0.0` | Host to listen on |
| `API_PORT` | `80` | Port to listen on |
| `PHOTOS_DIR` | `/photos` | Directory of source images |
| `CACHE_DIR` | `/data/cache` | Cache directory |
| `MAX_EDGE_PX` | `2048` | Maximum length in pixels of the long edge after resizing |
| `OUTPUT_FORMAT` | `jpeg` | Output format (only `jpeg` is supported; any other value stops startup with an error) |
| `JPEG_QUALITY` | `82` | JPEG quality (0 to 100) |
| `DEDUPE_WINDOW_SEC` | `60` | Seconds during which a photo is not served again to the same IP |
| `BUCKET_WIDTH_SEC` | `180` | Time window in seconds during which `/portrait/{photoframeId}` and `/landscape/{photoframeId}` return the same image. Must be a positive divisor of 86400, otherwise startup fails |
| `RESCAN_INTERVAL_SEC` | `300` | Interval in seconds for rescanning `photos/`. An integer from 0 to 2147483 (no sign, leading zeros or fraction); `0` disables periodic rescans. Invalid values stop startup with an error |

## Development

The Node.js version is pinned in `.node-version`, and the package manager is pnpm.

```bash
pnpm install
pnpm dev
```

By default the server reads `/photos` and writes `/data/cache`; override `PHOTOS_DIR` and `CACHE_DIR` for local runs.

## Running with Docker

```bash
cp .env.example .env
docker compose up --build
```

The server is published on port 3000 of the host. The host `photos/` directory is mounted read-only, and `cache/` is mounted for the generated files. Adding, changing or removing photos is picked up without restarting the container.

## Lint and tests

```bash
pnpm lint
pnpm test
```
