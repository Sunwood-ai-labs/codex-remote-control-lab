# Protocol Notes

この repo は protocol 実験を小さく再現できる形に保っています。

## Local Probe

app-server を起動します。

```bash
npm run server:ws
```

別 terminal から probe します。

```bash
npm run probe:ws
```

probe は次を送ります。

1. `initialize`
2. `initialized`
3. `thread/start`

送受信した JSON-RPC message を出力するので、Codex app-server 側の挙動変化をそのまま確認できます。

## Health Behavior

- `GET /readyz` は app-server ready 後に `200 OK` を返します。
- `GET /healthz` は外部 Origin なしなら `200 OK` を返します。
- local smoke test では、`Origin` header 付きの `GET /healthz` は `403 Forbidden` でした。

## Bridge Behavior

bridge は共有 browser thread ごとに upstream WebSocket を 1 本持ちます。通常の browser client は `/bridge?token=...` に接続し、upstream Codex app-server は `ws://127.0.0.1:45213` のままです。`PHONE_DEBUG_NO_TOKEN=1` の localhost 専用デバッグ時だけ、token なしの `/bridge` を使えます。
