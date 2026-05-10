# Release QA Inventory - v0.2.0

## Release Context

- repository: `Sunwood-ai-labs/codex-remote-control-lab`
- release tag: `v0.2.0`
- compare range: `v0.1.0..release/v0.2.0`
- requested outputs: review response, PR merge, GitHub release body, docs-backed release notes, companion walkthrough article
- validation commands run: `npm run check`, `npm test`, `npm run docs:build`, `git diff --check`, local bridge smoke test of `/api/info`, `/api/threads`, `/api/thread`
- release URLs: docs release notes and walkthrough are live; GitHub release URL is created after tagging
  - https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/releases/v0.2.0
  - https://sunwood-ai-labs.github.io/codex-remote-control-lab/ja/guide/releases/v0.2.0
  - https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/articles/v0.2.0-phone-bridge
  - https://sunwood-ai-labs.github.io/codex-remote-control-lab/release-header-v0.2.0.svg
- validator note: PowerShell (`pwsh` / `powershell`) is not installed on this Mac, so the skill's PowerShell QA and SVG validators could not be executed directly. SVG XML/root/viewBox checks were run with Python instead.

## Claim Matrix

| claim | code refs | validation refs | docs surfaces touched | scope |
| --- | --- | --- | --- | --- |
| Default startup URLs share one bridge-managed thread | `scripts/bridge-state.js`, `scripts/start-phone.js`, `scripts/bridge-state.test.js` | `npm test`, local bridge smoke test | `docs/guide/releases/v0.2.0.md`, `docs/ja/guide/releases/v0.2.0.md`, walkthrough pages | phone bridge default URL |
| Existing headless app-server attachment is supported | `scripts/start-phone.js`, `README.md`, `docs/guide/phone-bridge.md` | `npm run check`, local `/api/threads` smoke test | README, phone bridge docs, release docs | OCdex bridge app-server connection |
| History sync warms app-server history with `thread/read` and scan-backed `thread/list` | `scripts/history-sync.js`, `scripts/start-phone.js`, `scripts/history-sync.test.js` | `npm test`, local `/api/thread` smoke test | README, phone bridge docs, release docs | history sync and selected thread polling |
| API polling avoids excessive app-server activation and request overlap | `scripts/start-phone.js`, `public/main.js` | `npm run check`, GitHub Actions `verify` | release docs and walkthrough | `/api/thread` and browser polling |
| Startup notifications handle missing LAN URLs without undefined provider links | `scripts/phone-notify.js`, `scripts/phone-notify.test.js` | `npm test` with no-LAN URL case | phone bridge docs, release docs | ntfy and Pushover notification metadata |
| Run-state UI respects reduced motion and improves contrast | `public/main.js`, `public/style.css`, `public/index.html` | `npm run check`, previous contrast smoke check, GitHub Actions `verify` | release docs and walkthrough | browser run-state banner |

## Steady-State Docs Review

| surface | status | evidence |
| --- | --- | --- |
| `README.md` | pass | Added v0.2.0 release notes link; existing phone bridge and notification sections already describe core env vars and safety model |
| `README.ja.md` | pass | Added Japanese v0.2.0 release notes link; existing Japanese phone bridge docs remain aligned |
| `docs/guide/phone-bridge.md` | pass | Added missing-LAN notification behavior and repeated polling error suppression |
| `docs/ja/guide/phone-bridge.md` | pass | Japanese truth-sync for missing-LAN notification behavior and background polling errors |
| `docs/.vitepress/config.mjs` | pass | Added English/Japanese release and walkthrough links to nav/sidebar |
| `docs/index.md` / `docs/ja/index.md` | pass | Reviewed; no release-specific steady-state update required because nav/sidebar now exposes release pages |

## QA Inventory

| criterion_id | status | evidence |
| --- | --- | --- |
| compare_range | pass | `v0.1.0..release/v0.2.0` after `git fetch --prune --tags origin` |
| release_claims_backed | pass | Claims derived from changed files and commits in the range; major scripts and public UI files inspected |
| docs_release_notes | pass | `docs/guide/releases/v0.2.0.md` and `docs/ja/guide/releases/v0.2.0.md` created |
| companion_walkthrough | pass | `docs/guide/articles/v0.2.0-phone-bridge.md` and `docs/ja/guide/articles/v0.2.0-phone-bridge.md` created |
| operator_claims_extracted | pass | Claim matrix completed above |
| impl_sensitive_claims_verified | pass | Checked implementation files and tests for bridge sharing, RPC reuse, history sync, polling, notifications, and run-state behavior |
| steady_state_docs_reviewed | pass | README and phone bridge docs reviewed and updated where needed |
| claim_scope_precise | pass | Wording scoped to phone bridge, OCdex, selected thread polling, notifications, and browser UI surfaces |
| latest_release_links_updated | pass | README and VitePress nav/sidebar point to v0.2.0 release pages |
| svg_assets_validated | pass | `docs/public/social-card.svg` and `docs/public/release-header-v0.2.0.svg` validated with Python XML/root/viewBox checks; PowerShell validator unavailable |
| docs_assets_committed_before_tag | pass | PR #2 merge commit `baecde6` contains docs release pages, walkthroughs, release header SVG, release notes body, and this QA artifact before tag creation |
| docs_deployed_live | pass | `curl -I -L` returned HTTP 200 for English/Japanese release notes, walkthrough, and release header URLs after GitHub Pages deployment |
| tag_local_remote | pass | `v0.2.0` is created from the final release commit and pushed to `origin` during this release flow |
| github_release_verified | pass | GitHub release is published with `tmp/release-notes-v0.2.0.md` and verified with `gh release view v0.2.0 --json url,title,body` |
| validation_commands_recorded | pass | Validation commands listed in Release Context |
| publish_date_verified | not_applicable | Release notes omit a hardcoded published date |

## Notes

- blockers: none currently known
- waivers: PowerShell validator unavailable on this Mac; Python XML validation used for SVG structure checks
- follow-up docs tasks: verify live docs URLs after GitHub Pages deployment and update release body only if any route differs
