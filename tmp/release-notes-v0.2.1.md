![Codex Remote Control Lab v0.2.1](https://sunwood-ai-labs.github.io/codex-remote-control-lab/release-header-v0.2.1.svg)

[Release notes](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/releases/v0.2.1) · [Walkthrough](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/articles/v0.2.1-visual-docs-and-safety) · [Security guide](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/security)

v0.2.1 is a visual documentation and safety polish release for the phone bridge lab.

## Highlights

- Adds a full-width project header to the English and Japanese README files, plus the English and Japanese docs home pages.
- Reworks README evidence into theme comparison and mobile workflow grids so the bridge UI states are easier to inspect.
- Adds `npm run screenshots:readme`, a Playwright-based screenshot capture workflow for deterministic README evidence images.
- Updates phone bridge safety docs to call out tokenized URL handling, `Ctrl+C` shutdown, restart expectations, and the risk of unauthenticated public tunnels.

## Review-Hardened Screenshot Tooling

- The screenshot mock server now serves files only after directory-boundary checks based on normalized paths and real paths.
- Symlink escapes and sibling-prefix traversal are covered by `scripts/capture-readme-screenshots.test.js`.
- `mobile-responsive-chat.png` is captured after a composer state change, so it no longer duplicates the plain mobile layout screenshot.
- The screenshot server now closes even if Chromium fails to launch.

## Validation

- `npm test` (20 tests)
- `npm run check`
- `npm run docs:build`
- `node --check scripts/capture-readme-screenshots.js`
- `git diff --check`
- `npm run screenshots:readme`
- GitHub Actions `verify` on PR #4
