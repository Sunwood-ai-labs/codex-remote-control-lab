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

`PHONE_DEBUG_NO_TOKEN=1` は token なしデバッグ用の switch です。単独では bridge を `127.0.0.1` に bind し、token を作成・要求しません。

`PHONE_DEBUG_BIND=lan` は token なし LAN デバッグを明示的に有効化する bind 設定です。`PHONE_DEBUG_NO_TOKEN=1` と一緒に、自分が管理する信頼済み private network でだけ使い、public tunnel や raw port forward では使わないでください。

## 初心者向けの運用メモ

- 表示された `?token=...` 付き URL は local access key として扱います。開ける人は、その実行中の bridge を操作できます。
- token 付き URL を公開 issue、共有チャット、スクリーンショット、配信に貼らないでください。
- token なしデバッグ URL を host machine の外へ公開しないでください。
- bridge は `npm run phone` を実行している terminal で `Ctrl+C` を押すと停止します。
- terminal を閉じた場合や PC を再起動した場合、bridge は止まります。使うときはもう一度 `npm run phone` を実行します。
- bridge は root/admin shell ではなく、通常のユーザー権限で実行します。
- 認証なしの public tunnel や raw port forwarding で bridge を公開しないでください。SSH forwarding、VPN、device authentication 付き mesh network などの trusted access を前に置いてください。
