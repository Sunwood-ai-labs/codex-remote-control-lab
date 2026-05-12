# Phone Bridge

The phone bridge starts a local Codex app-server, waits for `/readyz`, and then starts a small HTTP/WebSocket bridge for browser clients on the LAN.

Its main job is to make the phone a remote control for the Codex session on your desktop. The desktop keeps the real Codex app-server local, while phone and desktop browsers can share the same bridge-managed thread.

## Start

```bash
npm ci
npm run phone
```

The command prints one URL per LAN IPv4 address:

```text
http://192.168.11.8:45214/?token=...
```

Open the exact printed URL from a phone or another browser on the same network. Use the phone to send prompts, approve work, inspect artifacts, and then resume the same thread from the desktop browser when you return to the PC.

The printed URL includes `?token=...`. Keep that URL private. To stop the bridge, press `Ctrl+C` in the terminal that is running `npm run phone`. If the terminal is closed or the PC restarts, start it again with `npm run phone`.

For repeatable local settings, copy the public-safe template:

```bash
cp .env.example .env
```

For localhost-only UI debugging, you can disable the token requirement explicitly:

```bash
PHONE_DEBUG_NO_TOKEN=1 npm run phone
```

For repeated local debugging, put `PHONE_DEBUG_NO_TOKEN=1` in the repo-local `.env` file. The bridge loads `.env` before resolving this mode.

This prints a tokenless `http://127.0.0.1:45214/` URL and binds the bridge to `127.0.0.1`. It is not for phones, LAN sharing, tunnels, or shared networks.

For tokenless debugging from another device on a trusted LAN, set `PHONE_DEBUG_BIND=lan` together with `PHONE_DEBUG_NO_TOKEN=1`. This binds the bridge to `0.0.0.0` and prints tokenless LAN URLs. Use it only on a private network you control.

## Runtime Layout

```text
phone browser
  -> token-protected bridge on 0.0.0.0:45214
  -> Codex app-server on ws://127.0.0.1:45213
```

The bridge shares a thread across multiple browser clients. Add `thread=<thread_id>` to resume a known Codex thread. This is the PC/mobile sync path: both devices are looking at the same bridge-managed Codex conversation instead of creating separate sessions.

For access outside a trusted LAN, do not publish the bridge through an unauthenticated public tunnel or raw port forward. Put trusted access, such as SSH forwarding, a VPN, or a device-authenticated mesh network, in front of it.

For live sync with Codex Desktop itself, connect OCdex to the same headless app-server that Desktop opens through a Remote Connection. The normal local conversation view in Codex Desktop uses a private `stdio` app-server, so there is no public external route for a bridge to inject live UI updates into that local view.

For history sync with the normal Desktop view, OCdex refreshes the app-server history after each completed turn by calling `thread/read` and a scan-backed `thread/list`. This is designed for the Desktop sidebar/history and for reopen/refresh continuity. It is not a live body update path for an already-open normal Desktop thread.

Example using an existing control socket:

```bash
CODEX_APP_SERVER_SOCK=/Users/admin/.codex/app-server-control/app-server-control.sock \
CODEX_WORKDIR=/Users/admin/Prj/demo \
PHONE_TOKEN=demo-test-token \
npm run phone
```

In this mode, OCdex does not start a new app-server. It uses the app-server behind the socket. If Codex Desktop opens the same headless app-server as a Remote Connection, the Desktop remote view and OCdex browser subscribe to the same thread event stream.

## Useful Environment Variables

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

See `.env.example` for the full commented template.

Startup notifications are optional. If `PHONE_NTFY_TOPIC` is set, the bridge posts the ready URLs to that ntfy topic. If `PHONE_PUSHOVER_TOKEN` and `PHONE_PUSHOVER_USER` are set, it sends the same URLs through Pushover. If `PHONE_DISCORD_WEBHOOK_URL` is set, it posts them to Discord. `npm run phone` loads local `.env` values before reading these variables. `PHONE_NTFY_SERVER` defaults to `https://ntfy.sh` and must use HTTPS. Notification requests time out after `PHONE_NOTIFY_TIMEOUT_MS`, which defaults to 5000 ms. When a LAN IPv4 URL is available, the message includes the tokenized bridge URL, so use a private/protected topic, account, or channel and keep notification credentials out of Git. If no LAN IPv4 URL is detected, the notification omits provider link fields and tells you to check the host console.

Tokenless debug mode intentionally skips startup notifications. If you manually send a `PHONE_DEBUG_NO_TOKEN=1` plus `PHONE_DEBUG_BIND=lan` URL to Discord, only do it with your own private/trusted webhook and channel. Anyone who can reach that LAN URL can operate the bridge without a token.

Background thread-list polling suppresses repeated identical errors. A transient app-server restart or token mismatch should not continuously fill the chat log with the same `/api/threads` failure.

## UI Surface

- recent thread list and thread resume
- phone control of the desktop Codex session
- PC/mobile continuity through a shared bridge-managed thread
- model, plugin, config, auth, and automation lookups
- approval and sandbox mode controls for the next turn
- repository artifact preview
- Markdown rendering for chat and artifacts
- browser image attachments passed to Codex as `localImage` inputs
- simple, cyberpunk, botanical, and Stigmata color themes from the settings panel
- LAN sharing for a single bridge-managed thread
