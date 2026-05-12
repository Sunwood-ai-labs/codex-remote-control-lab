# Release QA Inventory: v0.3.0

## Release Context

- repository: `Sunwood-ai-labs/codex-remote-control-lab`
- release tag: `v0.3.0`
- compare range: `v0.2.1..release/v0.3.0`
- requested outputs: release branch, PR, GitHub release body, docs-backed release notes, companion walkthrough article, QA inventory
- validation commands run: `npm test`, `npm run check`, `npm run docs:build`, `npm run screenshots:readme`, `git diff --check`, `xmllint --noout docs/public/release-header-v0.3.0.svg`
- release URLs: pending until the release PR is merged and the `v0.3.0` tag is published

## Claim Matrix

| claim | code refs | validation refs | docs surfaces touched | scope |
| --- | --- | --- | --- | --- |
| The bridge shell is maintained from React source and generated into `public/index.html` | `src/ui/Shell.jsx`, `scripts/build-ui.mjs`, `package.json` | `npm run check` | `docs/guide/releases/v0.3.0.md`, walkthrough pages | browser UI build path |
| The UI now exposes a desktop-like shell with left thread rail, central conversation, composer, and right panel tabs | `src/ui/Shell.jsx`, `public/main.js`, `public/style.css`, `public/index.html` | `npm run check`, `npm run docs:build` | release notes, walkthrough, README screenshots reviewed | phone bridge browser UI |
| Review digest cards summarize changed files and diff stats from working tree or latest commit | `public/main.js`, `scripts/start-phone.js` | `npm test`, `npm run check` | release notes and walkthrough | `/api/review` and chat UI only |
| Workspace browsing is bounded and filters local-only paths | `scripts/start-phone.js`, `public/main.js` | `npm run check`; code review of `discoverWorkspaceEntries` and `shouldSkipWorkspaceEntry` | release notes and walkthrough | `/api/workspace` only |
| Thread polling prefers live bridge history before app-server reads or resume fallback | `scripts/thread-read.js`, `scripts/thread-read.test.js`, `scripts/start-phone.js` | `npm test` | release notes and walkthrough | thread snapshot/polling helper |
| Tokenless debugging is explicit and localhost-only unless LAN exposure is separately requested | `scripts/start-phone.js`, `.env.example`, `README.md`, `README.ja.md`, `SECURITY.md`, docs guides | `npm run docs:build`, `npm test`, code review of auth-mode branches | README, security docs, phone bridge docs, release collateral | operator debug mode |
| v0.3.0 release collateral uses a versioned SVG header | `docs/public/release-header-v0.3.0.svg` | `xmllint --noout docs/public/release-header-v0.3.0.svg` | release notes, walkthrough, GitHub release body | docs/release visual asset |
| README screenshot capture works against the current bridge mock API | `scripts/capture-readme-screenshots.js`, `docs/assets/*.png` | `npm run screenshots:readme` | README screenshot grids and release collateral | local screenshot tooling |
| Workspace and review panels respect `CODEX_WORKDIR` when it differs from the bridge repo root | `scripts/start-phone.js`, `scripts/start-phone-workdir.test.js` | `npm test` | QA inventory | `/api/workspace`, `/api/review`, and `/api/file` open paths |

## Steady-State Docs Review

| surface | status | evidence |
| --- | --- | --- |
| README.md | pass | Existing v0.3.0-range docs already describe `.env.example`, debug token handling, Stigmata theme, refreshed screenshots, and history-sync scope |
| README.ja.md | pass | Japanese README mirrors the same operator-facing claims |
| SECURITY.md | pass | Tokenless debug and LAN/tunnel guidance reviewed in the v0.3.0 range |
| docs/guide/phone-bridge.md | pass | English operator guide documents `.env.example`, debug token behavior, and current feature list |
| docs/ja/guide/phone-bridge.md | pass | Japanese operator guide mirrors the English behavior |
| docs/guide/security.md | pass | English security guide reviewed for tokenless debug scope |
| docs/ja/guide/security.md | pass | Japanese security guide reviewed for tokenless debug scope |
| docs/.vitepress/config.mjs | pass | Updated latest release nav to v0.3.0 pages |

## QA Inventory

| criterion_id | status | evidence |
| --- | --- | --- |
| compare_range | pass | `git diff --stat v0.2.1..HEAD`, `git diff --name-status v0.2.1..HEAD`, and `git log --oneline --reverse v0.2.1..HEAD` reviewed on `release/v0.3.0` |
| release_claims_backed | pass | Claim matrix references changed files and release-range commits |
| docs_release_notes | pass | `docs/guide/releases/v0.3.0.md` and `docs/ja/guide/releases/v0.3.0.md` created |
| companion_walkthrough | pass | `docs/guide/articles/v0.3.0-desktop-bridge.md` and Japanese counterpart created |
| operator_claims_extracted | pass | Claim matrix covers React shell, review digest, workspace listing, thread polling, debug auth, and SVG collateral |
| impl_sensitive_claims_verified | pass | Implementing code paths and tests were inspected; validation commands are recorded above |
| steady_state_docs_reviewed | pass | Steady-State Docs Review table completed above |
| claim_scope_precise | pass | Review digest and workspace claims are scoped to `/api/review`, `/api/workspace`, and bridge UI surfaces |
| latest_release_links_updated | pass | VitePress nav points at v0.3.0 release and walkthrough pages |
| svg_assets_validated | pass | `xmllint --noout docs/public/release-header-v0.3.0.svg` passed; PowerShell SVG validator unavailable because `pwsh`/`powershell` is not installed |
| screenshot_pipeline_health | pass | `npm run screenshots:readme` passed after adding the current `/api/info` mock route |
| review_feedback_addressed | pass | PR review comments about `CODEX_WORKDIR` path anchoring, synchronous workspace/review operations, and C-quoted `git status --short` parsing addressed in `scripts/start-phone.js`; regression coverage added in `scripts/start-phone-workdir.test.js` |
| docs_assets_committed_before_tag | pass | Release collateral is committed on `release/v0.3.0` before the tag is created |
| docs_deployed_live | not_applicable | PR-first flow: live docs URLs can be verified after merge/deploy before GitHub Release publication |
| tag_local_remote | not_applicable | PR-first flow: tag creation is deferred until the release PR is merged to `main` |
| github_release_verified | not_applicable | PR-first flow: GitHub Release publication is deferred until the tag exists |
| validation_commands_recorded | pass | Release Context lists all commands run for this task |
| publish_date_verified | not_applicable | Release body omits a hardcoded publish date |

## Notes

- blockers: none for PR creation.
- waivers: PowerShell-specific validator scripts could not run because `pwsh`/`powershell` is not installed in this macOS environment; `xmllint` was used for SVG XML validation.
- follow-up docs tasks: after PR merge, wait for GitHub Pages deployment, verify live release/walkthrough/header URLs, then create the `v0.3.0` GitHub Release from `tmp/release-notes-v0.3.0.md`.
