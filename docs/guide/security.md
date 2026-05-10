# Security Model

This project is intentionally local-first.

## Public-Safe Defaults

- The Codex app-server examples bind to `127.0.0.1`.
- The phone bridge is the only LAN-facing server.
- Page, API, and WebSocket bridge requests require the same token.
- `.phone-token`, `.uploads/`, `.codex-home*/`, logs, and session databases stay out of Git.
- Startup notification credentials and tokenized URL messages should stay in private/protected notification accounts, topics, or channels.

## Do Not Do This

Do not bind an unauthenticated Codex app-server directly to a LAN or public interface.

For remote access outside a trusted local network, prefer:

- SSH port forwarding
- a VPN
- a mesh network with device-level authentication

## Token Handling

The bridge creates `.phone-token` with mode `0600` when `PHONE_TOKEN` is not provided. Delete `.phone-token` to rotate the generated token.
