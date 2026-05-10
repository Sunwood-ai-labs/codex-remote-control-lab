# Release QA Inventory: v0.2.1

## Release Context

- repository: `Sunwood-ai-labs/codex-remote-control-lab`
- release tag: `v0.2.1`
- compare range: `v0.2.0..v0.2.1`
- requested outputs: GitHub release body, docs-backed release notes, companion walkthrough article, QA inventory
- validation commands run: `npm test`, `npm run check`, `npm run docs:build`, `node --check scripts/capture-readme-screenshots.js`, `git diff --check`, `npm run screenshots:readme`, `xmllint --noout docs/public/release-header-v0.2.1.svg`
- release URLs: pending GitHub release publication; docs URLs expected under `https://sunwood-ai-labs.github.io/codex-remote-control-lab/`

## Claim Matrix

| claim | code refs | validation refs | docs surfaces touched | scope |
| --- | --- | --- | --- | --- |
| README and docs now use a full-width project header | `README.md`, `README.ja.md`, `docs/index.md`, `docs/ja/index.md`, `docs/assets/codex-remote-control-lab-header.png` | `npm run docs:build`, generated VitePress output inspection | `README.md`, `README.ja.md`, `docs/index.md`, `docs/ja/index.md` | public docs |
| README evidence is grouped into theme and mobile workflow grids | `README.md`, `README.ja.md`, `docs/assets/theme-*.png`, `docs/assets/mobile-*.png` | `npm run screenshots:readme`, diffed regenerated assets | `README.md`, `README.ja.md` | public README |
| Screenshot capture workflow is available through npm | `package.json`, `package-lock.json`, `scripts/capture-readme-screenshots.js` | `npm run screenshots:readme`, `node --check scripts/capture-readme-screenshots.js` | `docs/guide/releases/v0.2.1.md`, article pages | maintainer tooling |
| Screenshot mock file serving rejects traversal and symlink escapes | `scripts/capture-readme-screenshots.js`, `scripts/capture-readme-screenshots.test.js` | `npm test` 20 tests | release notes and walkthrough | local screenshot tooling only |
| Tokenized bridge URLs are documented as private local access keys | `README.md`, `README.ja.md`, `SECURITY.md`, `docs/guide/phone-bridge.md`, `docs/ja/guide/phone-bridge.md`, `docs/guide/security.md`, `docs/ja/guide/security.md` | docs review plus `npm run docs:build` | README, security docs, phone bridge guides | operator docs |

## Steady-State Docs Review

| surface | status | evidence |
| --- | --- | --- |
| README.md | pass | Header and screenshot grids updated; token URL and shutdown notes synced |
| README.ja.md | pass | Japanese header, screenshot grids, and safety notes synced |
| SECURITY.md | pass | Token URL, tunnel, notification, and local-only guidance present |
| docs/guide/phone-bridge.md | pass | Token URL privacy, shutdown, restart, and remote access guidance present |
| docs/ja/guide/phone-bridge.md | pass | Japanese operator guidance synced |
| docs/guide/security.md | pass | Public-safe bridge guidance updated in v0.2.1 diff |
| docs/ja/guide/security.md | pass | Japanese security guidance synced |
| docs/.vitepress/config.mjs | pass | Latest release nav points to v0.2.1 pages |

## QA Inventory

| criterion_id | status | evidence |
| --- | --- | --- |
| compare_range | pass | `git diff --stat v0.2.0..v0.2.1` and `git log --no-merges v0.2.0..v0.2.1` reviewed |
| release_claims_backed | pass | Claim matrix references changed files and tests from the v0.2.1 diff |
| docs_release_notes | pass | `docs/guide/releases/v0.2.1.md` and `docs/ja/guide/releases/v0.2.1.md` created |
| companion_walkthrough | pass | `docs/guide/articles/v0.2.1-visual-docs-and-safety.md` and Japanese counterpart created |
| operator_claims_extracted | pass | Claim matrix includes public header, screenshot tooling, path hardening, and token URL claims |
| impl_sensitive_claims_verified | pass | `scripts/capture-readme-screenshots.js` and test file inspected; `npm test` passed |
| steady_state_docs_reviewed | pass | Steady-State Docs Review table completed above |
| claim_scope_precise | pass | Screenshot tooling claims are scoped to local README capture tooling, not the production bridge |
| latest_release_links_updated | pass | VitePress release nav points at v0.2.1 |
| svg_assets_validated | pass | `xmllint --noout docs/public/release-header-v0.2.1.svg` passed; PowerShell SVG validator unavailable because `pwsh` is not installed |
| docs_assets_committed_before_tag | not_applicable | This task was requested after `v0.2.1` had already been tagged; docs collateral is being published as a post-tag release-notes pass |
| docs_deployed_live | blocked | Pending commit to `main` and GitHub Pages deploy |
| tag_local_remote | pass | `git ls-remote --tags origin v0.2.1` verified the remote tag |
| github_release_verified | blocked | Pending `gh release create v0.2.1` and `gh release view` verification |
| validation_commands_recorded | pass | Release Context lists all commands run for this task |
| publish_date_verified | not_applicable | Release body omits a hardcoded publish date |

## Notes

- blockers: live docs deploy and GitHub release publication are pending at the time this QA file is first written.
- waivers: PowerShell-specific validator scripts could not run because `pwsh`/`powershell` is not installed in this macOS environment.
- follow-up docs tasks: none currently identified after README, security, phone bridge, release page, and walkthrough sync.
