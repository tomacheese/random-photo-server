# AGENTS.md

## Language

- Write all deliverables in English: commit messages, PR and issue text, review comments, code comments and JSDoc, and documentation (including this file and `README.md`).
- Exceptions: end-user-facing text, quotations, technical identifiers, external source text and generated files stay as they are. Error messages are in English.
- Insert a half-width space between Japanese text and alphanumeric characters when Japanese text is unavoidable.

## Overview

A Fastify web server that picks a random image from `photos/`, resizes and compresses it with `sharp` into `cache/`, and serves it. It is mainly used by photo frames in VRChat worlds. See `README.md` for endpoints and environment variables.

## Development commands

Use pnpm (enforced by `preinstall`). The Node.js version is in `.node-version`.

```bash
pnpm install
pnpm dev          # tsx watch ./src/main.ts
pnpm start        # tsx ./src/main.ts
pnpm build        # tsc emit to dist/ (not used at runtime; the app runs src via tsx)
pnpm test         # vitest run
pnpm lint         # prettier --check, eslint, tsc
pnpm fix          # prettier --write, eslint --fix
docker compose up --build
```

## Architecture

- `src/main.ts`: entry point. Validates environment variables, initializes and watches `PhotoCache`, creates `PhotoSelector`, starts the Fastify server.
- `src/server.ts`: `buildApp`, which builds the Fastify app (CORS, rate limit, routers).
- `src/environments.ts`: the `ENV` object and `parseRescanIntervalSec`.
- `src/photo-cache/manifest.ts`: pure functions diffing a `photos/` scan against `cache/manifest.json`.
- `src/photo-cache/process.ts`: resize and compression with `sharp`.
- `src/photo-cache/index.ts`: `PhotoCache`. Builds the cache, watches `photos/` and `cache/` with `chokidar`, and rescans `photos/` periodically (`rescanIntervalMs`) for network mounts where watch events never arrive.
- `src/photo-selector.ts`: `PhotoSelector`. Random pick that avoids recently served photos per client IP.
- `src/photo-orientation.ts`: `getPhotoOrientation` (`portrait` / `landscape` / `square`).
- `src/deterministic-selector.ts`: `getBucketIndex` / `pickDeterministic` for time-bucketed deterministic selection.
- `src/endpoints/`: `BaseRouter` (`index.ts`), `RootRouter` (`/`, `/health`), `OrientationRouter` (`/portrait`, `/landscape` and the `:photoframeId` variants), `PhotosRouter` (`/photos`, `/photos/:id`), and shared response helpers in `photo-response.ts`.

## Conventions

- Add endpoints by extending `BaseRouter`.
- Routers depend on `PhotoCache` through the `PhotoCacheReader` interface (`src/endpoints/root.ts`) so tests can pass a fake.
- Read environment variables only through the `ENV` object in `src/environments.ts`.
- Commits follow Conventional Commits; branches follow Conventional Branch (`feat/`, `fix/`, ...).
- Do not add commits to Renovate-created PRs.
- Document exported functions, interfaces and classes with JSDoc.
- Do not use `skipLibCheck` in TypeScript.
- When commands, environment variables or architecture change, update this file and `README.md`.

## Safety and security rules

- Never expose `photos/` over HTTP. Serve only generated files from `cache/`.
- `OUTPUT_FORMAT` supports only `jpeg`. Any other value must stop startup with an error, not be silently ignored.
- `BUCKET_WIDTH_SEC` (default `180`) must be a positive integer that divides `86400`. Otherwise stop startup with an error. The Unity client assumes bucket boundaries fall at the same wall-clock instants every day.
- `RESCAN_INTERVAL_SEC` (default `300`) must be an integer from `0` to `2147483` in plain decimal notation (no sign, leading zeros or fraction); `0` disables periodic rescans. Otherwise stop startup with an error. Validation lives in `parseRescanIntervalSec` (`src/environments.ts`) and is called from `src/main.ts`.
- Do not hard-code secrets such as API keys or passwords; read them via `ENV`. Never commit files containing secrets.
- `photos/`, `cache/` and `data/` are gitignored. Never commit real photos or generated cache files.

## Testing

- Unit tests use Vitest and live next to the sources (`src/**/*.test.ts`).
- Real `chokidar` filesystem events are not covered by automated tests; verify them manually with `docker compose up`.
- Verify changes with `pnpm lint` and `pnpm test`, plus a manual check with `docker compose up` when needed.
