# Security Policy

## Supported Scope

This repository is an experimental local lab. The supported security posture is:

- keep the Codex app-server bound to `127.0.0.1`
- expose only the token-protected phone bridge to the LAN
- treat `.phone-token`, `.uploads/`, `.codex-home*/`, and generated session databases as local-only state
- treat startup notification credentials and tokenized URL messages as private local state

## Reporting

If you find a security issue, open a private advisory or contact the repository owner before publishing details.

## Public-Safe Checklist

- Do not commit local tokens, generated Codex homes, session databases, logs, uploads, or private screenshots.
- Do not bind `codex app-server` directly to a LAN or public interface without a separate authenticated private network.
- Treat printed `?token=...` URLs as private local access keys. Do not publish them in issues, chats, screenshots, or streams.
- Use `PHONE_DEBUG_NO_TOKEN=1` as the tokenless localhost debugging exception. Add `PHONE_DEBUG_BIND=lan` only for intentional tokenless LAN debugging on a trusted private network.
- Stop the bridge with `Ctrl+C`; closing the terminal or restarting the PC stops the process.
- Do not expose the bridge through an unauthenticated public tunnel or raw port forward.
- Run the bridge from a normal user account, not a root/admin shell.
- Local slash command extensions are prompt-only. The bridge does not load local shell-command extensions, and `/api/slash-commands` returns display metadata only, not prompt templates or command bodies.
- Send startup notifications only to private/protected notification accounts, topics, or channels.
- Rotate `PHONE_TOKEN` or delete `.phone-token` after demos on shared networks.
- Prefer SSH forwarding, a VPN, or a mesh network for access outside the local LAN.
