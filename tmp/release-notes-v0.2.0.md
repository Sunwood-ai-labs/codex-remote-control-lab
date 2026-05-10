![Codex Remote Control Lab v0.2.0](https://sunwood-ai-labs.github.io/codex-remote-control-lab/release-header-v0.2.0.svg)

[Docs release notes](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/releases/v0.2.0) · [日本語リリースノート](https://sunwood-ai-labs.github.io/codex-remote-control-lab/ja/guide/releases/v0.2.0) · [Walkthrough](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/articles/v0.2.0-phone-bridge)

## Highlights

v0.2.0 is the phone bridge continuity release. It covers the changes from `v0.1.0` through the reviewed `release/v0.2.0` branch.

- Default `/?token=...` startup URLs now join one shared bridge-managed thread, so a phone and a desktop browser do not accidentally create separate default sessions.
- The bridge can attach to an existing headless Codex app-server through `CODEX_APP_SERVER_URL` or `CODEX_APP_SERVER_SOCK` while keeping Codex itself bound to localhost.
- History sync is enabled by default and warms the app-server with `thread/read` plus scan-backed `thread/list` calls after completed turns.
- The browser UI now has a Codex Desktop-like layout, recent thread navigation, artifact previews, model/config/plugin/auth panels, image attachments, approval controls, status banners, and selectable themes.

## Review-Hardened Reliability

- `/api/thread` polling prefers `thread/read` and only falls back to `thread/resume` when needed.
- API-side app-server requests reuse a persistent WebSocket RPC client instead of reconnecting for every request.
- Selected-thread refreshes and background thread-list polling avoid request overlap and repeated error spam.
- Bridge history is capped to the latest 80 entries after live updates.
- Startup notifications omit provider link fields when no LAN IPv4 URL is detected, instead of sending `undefined` click targets.

## Docs And QA

- Added bilingual docs-backed release notes and companion walkthrough pages.
- Added a v0.2.0 release header derived from the existing docs social-card branding.
- Synced README and phone bridge guide links/details with the shipped behavior.

## Validation

- `npm run check`
- `npm test` (18 tests)
- `npm run docs:build`
- `git diff --check`
- Local bridge smoke test for `/api/info`, `/api/threads`, and `/api/thread`
- GitHub Actions `verify` on PR #2

## Upgrade Notes

No migration is required. Existing `npm run phone` usage keeps working. If you use startup notifications, keep notification destinations private because tokenized bridge URLs are included whenever a LAN URL is available.
