# Copilot instructions

Follow `AGENTS.md` at the repository root. Write review comments in English.

Review points:

- `photos/` must never be served over HTTP; only `cache/` output may be served.
- Invalid `OUTPUT_FORMAT`, `BUCKET_WIDTH_SEC` or `RESCAN_INTERVAL_SEC` must stop startup with an error, not be silently ignored.
- Real photos, `cache/` contents and secrets must not be committed.
