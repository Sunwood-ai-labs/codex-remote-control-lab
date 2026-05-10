![Codex Remote Control Lab](https://raw.githubusercontent.com/Sunwood-ai-labs/codex-remote-control-lab/main/docs/public/social-card.svg)

## v0.1.0 - Initial Phone Bridge Lab

This is the first public release of Codex Remote Control Lab. It packages the local-first Codex `app-server` experiment into a public-safe Node bridge, browser UI, documentation site, and verification workflow.

## Highlights

- Localhost-first Codex bridge: `scripts/start-phone.js` starts Codex `app-server` on `ws://127.0.0.1:<port>` and exposes only the token-protected browser bridge on the LAN.
- Shared phone and desktop browser UI: the bridge can share one managed thread across clients, resume recent threads, and route messages, approvals, sandbox settings, model choices, and image attachments.
- Codex Desktop-like UI: the browser surface includes a sidebar, central conversation, right artifact panel, bottom composer, Markdown rendering, image previews, grouped threads, collapsible status logs, and mobile/tablet responsive layouts.
- Theme support: the settings panel now includes simple, cyberpunk, and botanical color themes, saved in browser local storage.
- Public documentation: bilingual README/docs, VitePress pages, security guidance, protocol notes, screenshot evidence, CI, and GitHub Pages deployment are included.

## Safety Model

- The Codex app-server examples stay bound to `127.0.0.1`.
- The LAN-facing bridge requires the generated or provided phone token on page, API, upload, artifact, and WebSocket paths.
- Local-only files such as `.phone-token`, `.uploads/`, `.codex-home*/`, logs, generated dist output, and session databases are ignored.

## Validation

Validated for this release:

- `npm run check`
- `npm audit --omit=dev`
- `npm run docs:build`
- `xmllint --noout docs/public/logo.svg docs/public/social-card.svg`
- Browser smoke check against `npm run phone` with `PHONE_TOKEN=test`: settings panel showed three theme options and switching to Cyberpunk set `html[data-theme="cyberpunk"]`.
- GitHub Actions CI completed successfully on `main` at `742200222b6f33e19024bc15d44c7784936c6bf5`.
- Live docs returned HTTP 200 for the home page and phone bridge guide.

## Links

- Docs: https://sunwood-ai-labs.github.io/codex-remote-control-lab/
- Phone bridge guide: https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/phone-bridge
- Japanese docs: https://sunwood-ai-labs.github.io/codex-remote-control-lab/ja/
- Source: https://github.com/Sunwood-ai-labs/codex-remote-control-lab
