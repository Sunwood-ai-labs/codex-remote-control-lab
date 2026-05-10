# Release QA Inventory - v0.1.0

## Scope

- Tag: `v0.1.0`
- Release type: initial public release
- Comparison range: no previous tags existed after `git fetch --tags origin`; scope is full repository history through `main` commit `742200222b6f33e19024bc15d44c7784936c6bf5`.
- Repository visibility: GitHub reports `PUBLIC`.

## Claim Matrix

| Claim | Evidence | Status |
| --- | --- | --- |
| Codex app-server stays localhost-first while bridge is LAN-facing | `scripts/start-phone.js` uses `ws://127.0.0.1:${codexPort}` for Codex and prints LAN URLs for the bridge; `README.md` and `docs/guide/security.md` describe the boundary. | pass |
| Bridge is token protected | `scripts/start-phone.js` implements `getToken()` and `requireToken()` and applies token checks to API/artifact/upload/WebSocket paths. | pass |
| Shared browser clients can use one bridge-managed thread | `scripts/start-phone.js` maintains bridge state and README/docs describe phone + desktop browser sharing. | pass |
| Browser UI supports artifacts, approvals, models, plugins, automations, Markdown, images, grouped threads, and status logs | `public/main.js`, `public/style.css`, docs, and screenshot assets cover these UI surfaces. | pass |
| Theme selector supports simple, cyberpunk, and botanical themes | `public/main.js` defines `themeOptions`; `public/style.css` defines the three theme variable sets; browser check verified the settings panel and Cyberpunk switch. | pass |
| Docs and public assets are release-ready | `README.md`, `README.ja.md`, `docs/`, `docs/public/logo.svg`, `docs/public/social-card.svg`, and GitHub Pages config are present. | pass |

## Steady-State Docs Review

| Surface | Review Result | Status |
| --- | --- | --- |
| `README.md` | Updated to mention selectable color themes and theme selector screenshot evidence. | pass |
| `README.ja.md` | Updated to mention selectable color themes and theme selector screenshot evidence. | pass |
| `docs/guide/phone-bridge.md` | Updated UI surface list with simple/cyberpunk/botanical themes. | pass |
| `docs/ja/guide/phone-bridge.md` | Updated UI surface list with simple/cyberpunk/botanical themes. | pass |
| `docs/guide/security.md` and `SECURITY.md` | Reviewed; theme/UI release does not change the localhost-first or token boundary wording. | pass |
| Release note/docs article pages | Explicitly skipped because the user requested tagging and releasing the current state as `v0.1.0`; no new docs routes were added for this current-state initial release. | pass |

## QA Gate

| Criterion | Evidence | Status |
| --- | --- | --- |
| Comparison range resolved | `git tag --list` returned no tags before release; `git log --reverse` and empty-tree diff were inspected. | pass |
| Release claims backed by files/diffs | Inspected README/docs, `scripts/start-phone.js`, `scripts/probe-ws.js`, `public/main.js`, `public/style.css`, workflows, and SVG assets. | pass |
| Docs-backed release notes created or skipped | Skipped repository docs pages due current-state release scope; GitHub release body is stored in `tmp/release-notes-v0.1.0.md`. | pass |
| Companion walkthrough article created or skipped | Skipped for the same current-state scope; steady-state README and guide docs were truth-synced instead. | pass |
| Implementation-sensitive claims verified | Verified against `scripts/start-phone.js`, `public/main.js`, `public/style.css`, `README.md`, and docs. | pass |
| Claim scope precise | Release wording scopes behavior to the bridge/browser UI and localhost app-server pattern. | pass |
| SVG assets validated | `xmllint --noout docs/public/logo.svg docs/public/social-card.svg` passed. Skill PowerShell SVG validator was unavailable because `pwsh/powershell` is not installed on this Mac. | pass |
| Focused local validation run | `npm run check`, `npm audit --omit=dev`, and `npm run docs:build` passed. | pass |
| Browser UI smoke run | `PHONE_TOKEN=test PHONE_UI_PORT=48732 CODEX_APP_SERVER_PORT=48733 npm run phone`; settings panel had 3 theme options and Cyberpunk set `html[data-theme="cyberpunk"]`. | pass |
| CI status | `gh run list` showed CI success for `742200222b6f33e19024bc15d44c7784936c6bf5`. | pass |
| Live docs verified | `curl -I -L` returned HTTP 200 for docs home and `/guide/phone-bridge`. | pass |
| Release tag created and pushed | `git tag -a v0.1.0 742200222b6f33e19024bc15d44c7784936c6bf5 -m "v0.1.0"` and `git push origin v0.1.0` succeeded; `git ls-remote --tags origin v0.1.0` returned the remote tag. | pass |
| GitHub release published and verified | `gh release create v0.1.0 --target 742200222b6f33e19024bc15d44c7784936c6bf5 --title "v0.1.0 - Initial Phone Bridge Lab" --notes-file tmp/release-notes-v0.1.0.md` succeeded; `gh release view v0.1.0 --json url,name,body,tagName,isDraft,isPrerelease,publishedAt,targetCommitish` verified the final body and public URL. | pass |
| QA validator | Skill PowerShell validator could not run because `pwsh/powershell` is not installed; inventory was manually checked against the required criteria. | pass |
