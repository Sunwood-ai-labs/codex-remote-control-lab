# Protocol Notes

This repository keeps the protocol experiments small and reproducible.

## Local Probe

Start the app-server:

```bash
npm run server:ws
```

Probe it from another terminal:

```bash
npm run probe:ws
```

The probe performs:

1. `initialize`
2. `initialized`
3. `thread/start`

It prints the JSON-RPC messages it sent and received so changes in Codex app-server behavior can be inspected directly.

## Observed Health Behavior

- `GET /readyz` returns `200 OK` when the app-server is ready.
- `GET /healthz` returns `200 OK` without an external origin.
- `GET /healthz` with an `Origin` header returned `403 Forbidden` in the local smoke test.

## Bridge Behavior

The bridge keeps one upstream WebSocket connection per shared browser thread. Browser clients normally talk to `/bridge?token=...`, while the upstream Codex app-server remains at `ws://127.0.0.1:45213`. With `PHONE_DEBUG_NO_TOKEN=1`, localhost-only debug clients can use `/bridge` without a token.
