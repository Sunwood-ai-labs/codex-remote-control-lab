<p align="center">
  <img src="docs/assets/codex-remote-control-lab-header.png" alt="Codex Remote Control Lab" style="width:100%;height:auto;">
</p>

<p align="center">
  <a href="README.ja.md">日本語</a> ·
  <a href="https://sunwood-ai-labs.github.io/codex-remote-control-lab/">Docs</a> ·
  <a href="https://github.com/Sunwood-ai-labs/codex-remote-control-lab">GitHub</a>
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933">
  <img alt="Codex CLI" src="https://img.shields.io/badge/Codex%20CLI-0.130.0-111111">
  <img alt="License" src="https://img.shields.io/badge/License-ISC-blue">
  <img alt="Public safe" src="https://img.shields.io/badge/Public--safe-localhost%20first-41d6a4">
</p>

# Codex Remote Control Lab

Codex Remote Control Lab turns your phone into a remote control for the Codex session running on your desktop. Start the bridge on the Mac, open the tokenized URL from a phone, and continue the same Codex thread from either device.

It is a local-first experiment for OpenAI Codex CLI `remote-control` and `app-server` workflows. It keeps the Codex app-server on `127.0.0.1`, then exposes only a small token-protected browser bridge to devices on the same LAN.

## ✨ What It Does

- starts a repository-local Codex CLI `0.130.0` app-server
- lets a phone browser operate the desktop Codex app-server without exposing that app-server directly to the LAN
- syncs one active Codex thread between desktop and phone, so you can start on the PC, step away, and keep working from mobile
- serves a phone-friendly browser UI with thread resume, artifact preview, approvals, model selection, image attachments, and selectable color themes
- shares one bridge-managed Codex thread across a phone and desktop browser
- keeps `.phone-token`, `.uploads/`, `.codex-home*/`, logs, and session databases out of Git
- publishes bilingual docs through VitePress and GitHub Pages

## 🚀 Quick Start

```bash
git clone https://github.com/Sunwood-ai-labs/codex-remote-control-lab.git
cd codex-remote-control-lab
npm ci
npm run phone
```

The command prints a URL like this:

```text
http://192.168.11.8:45214/?token=...
```

Open that exact URL from a phone connected to the same Wi-Fi/LAN.

For repeatable local settings, copy the example file and edit it:

```bash
cp .env.example .env
```

For localhost-only UI debugging without a token, run:

```bash
PHONE_DEBUG_NO_TOKEN=1 npm run phone
```

You can also put `PHONE_DEBUG_NO_TOKEN=1` in `.env` for the same localhost-only mode.

That debug mode binds the bridge to `127.0.0.1` and prints a URL without `?token=...`. Do not use it for LAN, tunnel, or shared-network access.

If you intentionally need tokenless access from another device on a trusted LAN, add `PHONE_DEBUG_BIND=lan` alongside `PHONE_DEBUG_NO_TOKEN=1`. This binds the bridge to `0.0.0.0` and prints LAN URLs without a token, so only use it on a private network you control.

## 🧭 Architecture

```text
phone browser -> http://Mac-LAN-IP:45214 -> Node bridge -> ws://127.0.0.1:45213 -> Codex app-server
```

The safer boundary is intentional: Codex's app-server remains bound to localhost; only the small token-protected bridge is reachable from the LAN.

## 🧪 Verification Commands

```bash
npm run check
npm run docs:build
npm audit --omit=dev
```

Protocol-only smoke test:

```bash
npm run server:ws
npm run probe:ws
```

The local smoke test verified `initialize` and `thread/start` through the WebSocket app-server, plus `/readyz` and `/healthz` behavior.

## 📱 Phone Bridge

The main value of the bridge is continuity: the desktop keeps running Codex locally, while the phone becomes a LAN remote for that same session. The bridge-managed thread can be opened from both the PC browser and the phone browser, making the workflow feel synced instead of split across devices.

Useful environment variables:

```text
PHONE_UI_PORT=45214
CODEX_WORKDIR=/Users/admin/Prj/some-project
CODEX_MODEL=gpt-5.4
CODEX_APP_SERVER_SOCK=/Users/admin/.codex/app-server-control/app-server-control.sock
CODEX_APP_SERVER_URL=ws://127.0.0.1:45213
CODEX_HISTORY_SYNC=1
PHONE_TOKEN=choose-your-own-token
PHONE_DEBUG_NO_TOKEN=1
PHONE_DEBUG_BIND=lan
PHONE_NTFY_TOPIC=your-private-topic
PHONE_PUSHOVER_TOKEN=app-token
PHONE_PUSHOVER_USER=user-key
PHONE_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
PHONE_NOTIFY_TIMEOUT_MS=5000
```

See [.env.example](.env.example) for a public-safe template.

`CODEX_APP_SERVER_SOCK` or `CODEX_APP_SERVER_URL` makes the bridge attach to an existing headless app-server instead of starting a new one. For live sync with Codex Desktop, use this with a Desktop Remote Connection that points at the same headless app-server. The normal local conversation view in Codex Desktop uses a private `stdio` app-server, so there is no public external route for a bridge to inject live UI updates into that local view.

History sync is enabled by default. After a web turn completes, the bridge warms the app-server history with `thread/read` and a scan-backed `thread/list`, and `/api/threads` also avoids state-DB-only listing. This helps Codex Desktop discover the updated session after reopening or refreshing the thread. It does not inject live updates into an already-open normal Desktop conversation view. Set `CODEX_HISTORY_SYNC=0` to disable the extra history refresh calls.

Startup notifications are opt-in. `PHONE_NTFY_TOPIC` sends the bridge URLs to an ntfy topic, `PHONE_PUSHOVER_TOKEN` plus `PHONE_PUSHOVER_USER` sends them through Pushover, and `PHONE_DISCORD_WEBHOOK_URL` posts them to Discord. `npm run phone` loads local `.env` values before reading these variables. `PHONE_NTFY_SERVER` defaults to `https://ntfy.sh` and must use HTTPS. The notification body includes the tokenized bridge URL, so use a private/protected topic, account, or channel and keep these values in local environment variables.

Tokenless debug mode intentionally skips startup notifications. If you manually send a `PHONE_DEBUG_NO_TOKEN=1` plus `PHONE_DEBUG_BIND=lan` URL to Discord, treat that channel as private and trusted: anyone who can open the URL on the LAN can operate the bridge without a token.

The current phone bridge supports:

- Codex Desktop-like browser layout with a left thread sidebar, central conversation, right artifact panel, and bottom composer
- recent thread listing and direct thread resume
- default history-sync refresh for Desktop reopen/refresh continuity
- plugin, model, config/auth, and automation status panels
- approval and sandbox mode controls for the next turn
- Markdown rendering in chat and artifact previews
- Markdown image links rendered inline where possible
- browser-selected image attachments sent as Codex `localImage` inputs
- local repository image artifacts served through token-protected file routes
- collapsed status/tool logs with expandable detail rows
- simple, cyberpunk, botanical, and Stigmata color themes saved in browser local storage

## 🖼️ UI Evidence

Desktop-like layout:

![Desktop-like UI desktop screenshot](docs/assets/desktop-like-ui-desktop.png)

Compact chat typography with image-link preview:

![Compact chat font with image preview screenshot](docs/assets/chat-font-image-preview.png)

Theme comparison:

<table>
  <tr>
    <td align="center" width="25%">
      <img src="docs/assets/theme-simple-desktop.png" alt="Simple theme desktop screenshot" width="280"><br>
      <sub>Simple desktop</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/theme-cyberpunk-desktop.png" alt="Cyberpunk theme desktop screenshot" width="280"><br>
      <sub>Cyberpunk desktop</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/theme-botanical-desktop.png" alt="Botanical theme desktop screenshot" width="280"><br>
      <sub>Botanical desktop</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/theme-stigmata-desktop.png" alt="Stigmata theme desktop screenshot" width="280"><br>
      <sub>Stigmata desktop</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="25%">
      <img src="docs/assets/theme-simple-mobile-settings.png" alt="Simple theme mobile settings screenshot" width="180"><br>
      <sub>Simple settings</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/theme-cyberpunk-mobile-settings.png" alt="Cyberpunk theme mobile settings screenshot" width="180"><br>
      <sub>Cyberpunk settings</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/theme-botanical-mobile-settings.png" alt="Botanical theme mobile settings screenshot" width="180"><br>
      <sub>Botanical settings</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/theme-stigmata-mobile-settings.png" alt="Stigmata theme mobile settings screenshot" width="180"><br>
      <sub>Stigmata settings</sub>
    </td>
  </tr>
</table>

Mobile flow:

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/assets/desktop-like-ui-mobile.png" alt="Desktop-like UI mobile screenshot" width="220"><br>
      <sub>Mobile layout</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/assets/mobile-responsive-chat.png" alt="Mobile responsive chat screenshot" width="220"><br>
      <sub>Responsive chat</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/assets/mobile-responsive-drawer.png" alt="Mobile responsive drawer screenshot" width="220"><br>
      <sub>Thread drawer</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="docs/assets/theme-cyberpunk-mobile-settings.png" alt="Cyberpunk theme settings screenshot" width="220"><br>
      <sub>Theme settings</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/assets/mobile-desktop-like-controls.png" alt="Mobile desktop-like controls screenshot" width="220"><br>
      <sub>Composer controls</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/assets/mobile-model-menu.png" alt="Mobile model menu screenshot" width="220"><br>
      <sub>Model menu</sub>
    </td>
  </tr>
</table>

More screenshots are available in `docs/assets/` and through the artifact panel in the bridge UI.

## 🔐 Safety Notes

- Keep the Codex app-server on `127.0.0.1`.
- Do not bind an unauthenticated Codex app-server to a LAN or public interface.
- Treat the printed `?token=...` URL like a local access key. Do not post it in public issues, chats, screenshots, or streams.
- Use `PHONE_DEBUG_NO_TOKEN=1` for localhost debugging. Add `PHONE_DEBUG_BIND=lan` only when you intentionally want tokenless LAN access on a trusted private network.
- Stop the bridge with `Ctrl+C`. If you close the terminal or restart the PC, run `npm run phone` again.
- Use SSH forwarding, a VPN, or a mesh network for access outside a trusted LAN.
- Do not expose the bridge through an unauthenticated public tunnel or raw port forward.
- Delete `.phone-token` or set a new `PHONE_TOKEN` after demos on shared networks.

See [SECURITY.md](SECURITY.md) for the public-safe checklist.

## 📚 Documentation

- [English docs](https://sunwood-ai-labs.github.io/codex-remote-control-lab/)
- [日本語ドキュメント](https://sunwood-ai-labs.github.io/codex-remote-control-lab/ja/)
- [v0.3.0 release notes](https://sunwood-ai-labs.github.io/codex-remote-control-lab/guide/releases/v0.3.0)
- [Phone bridge guide](docs/guide/phone-bridge.md)
- [Protocol notes](docs/guide/protocol.md)
- [Security model](docs/guide/security.md)
- [Contributing and upstream PRs](docs/guide/contributing.md)

## 🗂️ Repository Layout

```text
public/              Browser UI served by the phone bridge
scripts/             Codex app-server probe and bridge launcher
docs/                VitePress docs and screenshot assets
docs/assets/         UI verification screenshots
docs/public/         Docs/README identity assets
.github/workflows/   CI and GitHub Pages deployment
```

## 📄 License

ISC. See [LICENSE](LICENSE).
