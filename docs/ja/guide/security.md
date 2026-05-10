# Security Model

この project は local-first を前提にしています。

## 公開安全の既定値

- Codex app-server の例は `127.0.0.1` に bind します。
- LAN に出る server は phone bridge だけです。
- page、API、WebSocket bridge request は同じ token を要求します。
- `.phone-token`、`.uploads/`、`.codex-home*/`、log、session database は Git に入れません。
- 起動通知の credential と token 付き URL の通知先は、private/protected な account、topic、channel に限定してください。

## 避けること

認証なしの Codex app-server を LAN や public interface に直接 bind しないでください。

信頼済み local network 外から使う場合は、次を優先します。

- SSH port forwarding
- VPN
- device-level authentication 付き mesh network

## Token Handling

`PHONE_TOKEN` が未指定の場合、bridge は mode `0600` の `.phone-token` を作ります。token を rotate するときは `.phone-token` を削除します。
