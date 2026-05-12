![Codex Remote Control Lab v0.3.0](https://sunwood-ai-labs.github.io/codex-remote-control-lab/release-header-v0.3.0.svg)

[Release notes](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/releases/v0.3.0) · [Walkthrough](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/articles/v0.3.0-desktop-bridge) · [Security guide](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/security)

v0.3.0 turns the phone bridge into a much closer desktop-style Codex control surface while preserving the localhost-first app-server boundary.

## Highlights

- Adds a maintained React source for the shell in `src/ui/Shell.jsx`, with `npm run build:ui` generating `public/index.html`.
- Reworks the bridge into a desktop-style layout with a left thread rail, central conversation, bottom composer, and right artifacts/workspace/review panel.
- Adds resizable left and right panels plus mobile drawer/right-panel accessibility state handling.
- Adds chat review digest cards backed by `/api/review`, showing working-tree or latest-commit changed files and diff stats.
- Adds `/api/workspace` for bounded workspace browsing while excluding local-only paths such as `.env`, `.phone-token`, `.codex-home*`, `.uploads`, and `node_modules`.
- Keeps workspace, review, and file-open paths anchored to the configured `CODEX_WORKDIR`, including filenames with spaces.

## Bridge And Safety

- Adds `scripts/thread-read.js` so thread polling can serve live bridge history first, then fall back to `thread/read` or resume when needed.
- Uses async filesystem traversal and async Git subprocesses for the workspace/review endpoints.
- Adds `.env.example` for public-safe local configuration.
- Adds explicit `PHONE_DEBUG_NO_TOKEN=1` localhost-only debug mode.
- Requires `PHONE_DEBUG_BIND=lan` before tokenless debug mode can bind to `0.0.0.0` on a trusted private LAN.
- Skips startup notifications in debug-no-token mode.

## UI Evidence

- Retunes the simple, cyberpunk, and botanical themes for the new shell.
- Adds the image-backed Stigmata theme.
- Refreshes README screenshots and docs assets for the four-theme comparison and updated mobile controls.

## Validation

- `npm test`
- `npm run check`
- `npm run docs:build`
- `npm run screenshots:readme`
- `git diff --check`
- `xmllint --noout docs/public/release-header-v0.3.0.svg`
