# launchd Examples

The `ops/launchd/*.plist.example` files show an optional two-process setup:

- one job keeps the Codex app-server bound to `ws://127.0.0.1:45213`
- one job starts the token-protected phone bridge and connects to that local app-server

Before using either example, copy it outside the repository, replace placeholders, and keep the filled file local-only.

Required placeholders:

- `<repo-root>`: absolute path to your local clone
- `<log-dir>`: absolute path to a local log directory that already exists and is writable

Do not commit filled launchd files. They may contain local folder names, local log paths, notification topics, or other machine-specific values.

The examples intentionally keep the Codex app-server on localhost. Only the phone bridge is intended to be reachable from trusted LAN clients, and the bridge remains token-protected by default.
