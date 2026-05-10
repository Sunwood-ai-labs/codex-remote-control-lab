---
layout: home
hero:
  name: Codex Remote Control Lab
  text: Control your desktop Codex session from your phone
  tagline: Keep Codex bound to localhost, expose only a token-protected LAN bridge, and continue the same thread across PC and mobile.
  image:
    src: /logo.svg
    alt: Codex Remote Control Lab icon
  actions:
    - theme: brand
      text: Start the Bridge
      link: /guide/phone-bridge
    - theme: alt
      text: Security Model
      link: /guide/security
features:
  - title: Localhost-first
    details: The Codex app-server examples bind to 127.0.0.1. The LAN-facing surface is the Node bridge.
  - title: Phone remote
    details: Your phone browser can operate the desktop Codex app-server through the token-protected bridge.
  - title: Session sync
    details: Share one bridge-managed thread between desktop and phone, so the same Codex work continues on either device.
  - title: Public-safe
    details: Token files, uploads, local Codex homes, logs, and session databases are ignored and documented as local-only.
---

<p align="center">
  <img src="./assets/codex-remote-control-lab-header.png" alt="Codex Remote Control Lab" style="width:100%;height:auto;">
</p>

## Quick Start

```bash
npm ci
npm run phone
```

Open the printed URL from a phone or another browser on the same Wi-Fi/LAN. The phone can drive the desktop Codex session, and another browser can resume the same bridge-managed thread.

For protocol-only testing, run the app-server and probe from separate terminals:

```bash
npm run server:ws
npm run probe:ws
```

## Layout

```text
phone browser -> http://Mac-LAN-IP:45214 -> Node bridge -> ws://127.0.0.1:45213 -> Codex app-server
```

The app-server remains local. The bridge requires a token on page, API, and WebSocket requests.
