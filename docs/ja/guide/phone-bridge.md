# Phone Bridge

Phone bridge は Codex app-server をローカルで起動し、`/readyz` を待ってから LAN 用の小さな HTTP/WebSocket bridge を立ち上げます。

一番の役割は、スマホをデスクトップ Codex セッションのリモコンにすることです。Codex app-server 本体は Mac の localhost に閉じたまま、phone browser と desktop browser が同じ bridge-managed thread を共有できます。

## 起動

```bash
npm ci
npm run phone
```

次のような URL が表示されます。

```text
http://192.168.11.8:45214/?token=...
```

同じネットワーク上のスマホや別ブラウザから、その URL をそのまま開きます。スマホから prompt 送信、承認、artifact 確認まで行い、PC に戻ったら同じ thread を desktop browser で resume できます。

表示された URL には `?token=...` が含まれます。この URL は private に扱ってください。bridge を止めるときは、`npm run phone` を実行している terminal で `Ctrl+C` を押します。terminal を閉じた場合や PC を再起動した場合は、もう一度 `npm run phone` を実行します。

繰り返し使う local 設定は、公開安全な template をコピーして編集できます。

```bash
cp .env.example .env
```

token なしで UI をローカルデバッグする場合は、明示的に次を指定します。

```bash
PHONE_DEBUG_NO_TOKEN=1 npm run phone
```

繰り返しローカルデバッグする場合は、repo-local の `.env` に `PHONE_DEBUG_NO_TOKEN=1` を置けます。bridge は mode 判定前に `.env` を読み込みます。

この場合は `http://127.0.0.1:45214/` のような token なし URL を表示し、bridge は `127.0.0.1` に bind されます。スマホ、LAN 共有、tunnel、shared network 用ではありません。

信頼できる LAN 上の別端末から token なしでデバッグする場合は、`PHONE_DEBUG_NO_TOKEN=1` と `PHONE_DEBUG_BIND=lan` を組み合わせます。この場合は bridge を `0.0.0.0` に bind し、token なし LAN URL を表示します。自分が管理する private network でだけ使ってください。

## 構成

```text
phone browser
  -> token-protected bridge on 0.0.0.0:45214
  -> Codex app-server on ws://127.0.0.1:45213
```

複数ブラウザで同じ bridge thread を共有できます。既存 thread を指定するときは `thread=<thread_id>` を URL に足します。これが PC/スマホ同期の経路で、端末ごとに別セッションを作るのではなく、同じ Codex 会話を両方から操作します。

trusted LAN の外から使う場合、認証なしの public tunnel や raw port forwarding で bridge を公開しないでください。SSH forwarding、VPN、device authentication 付き mesh network などの trusted access を前に置いてください。

Codex Desktop 本体とライブ同期したい場合は、Desktop の通常ローカル会話画面ではなく、Desktop の Remote Connection が接続する headless app-server と OCdex を同じ endpoint に接続します。Desktop の通常ローカル会話画面は `stdio` 接続の専用 app-server を使うため、外部クライアントからその画面へ直接ライブ注入する公開経路はありません。

通常の Desktop 画面向けの履歴同期として、OCdex は turn 完了後に `thread/read` と scan-backed な `thread/list` を呼び、app-server の履歴/index を温めます。これは Desktop の sidebar/history と、thread を開き直す/再読込したときの追従を狙うものです。すでに開いている通常 Desktop thread の本文へライブ反映する経路ではありません。

既存の control socket を OCdex と共有する例:

```bash
CODEX_APP_SERVER_SOCK=/Users/admin/.codex/app-server-control/app-server-control.sock \
CODEX_WORKDIR=/Users/admin/Prj/demo \
PHONE_TOKEN=demo-test-token \
npm run phone
```

このモードでは OCdex は新しい app-server を起動せず、指定した socket の app-server を使います。Desktop 側も同じ headless app-server を Remote Connection として開くと、Desktop Remote 画面と OCdex browser が同じ thread event stream を購読できます。

## 環境変数

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

コメント付きの全体 template は `.env.example` にあります。

起動通知は任意です。`PHONE_NTFY_TOPIC` を設定すると ready URL を ntfy topic へ投稿します。`PHONE_PUSHOVER_TOKEN` と `PHONE_PUSHOVER_USER` を設定すると同じ URL を Pushover へ送ります。`PHONE_DISCORD_WEBHOOK_URL` を設定すると Discord へ投稿します。`npm run phone` は local `.env` を読んでから環境変数を参照します。`PHONE_NTFY_SERVER` は既定で `https://ntfy.sh`、HTTPS 必須です。通知 request は `PHONE_NOTIFY_TIMEOUT_MS` で timeout し、既定は 5000 ms です。LAN IPv4 URL がある場合、通知本文には token 付き bridge URL が入るため、private/protected topic、account、channel を使い、通知用 credential は Git に入れないでください。LAN IPv4 URL を検出できない場合は、provider の link field を省略し、host console を確認するよう通知します。

token なしデバッグモードでは、起動通知は意図的にスキップされます。`PHONE_DEBUG_NO_TOKEN=1` と `PHONE_DEBUG_BIND=lan` の URL を手動で Discord に送る場合は、自分の private/trusted な webhook・channel に限定してください。同じ LAN URL に到達できる人は、token なしで bridge を操作できます。

background の thread 一覧 polling は、同じ error の連続表示を抑えます。app-server の短い再起動や token mismatch が起きても、同じ `/api/threads` failure が chat log に増え続けることは避けます。

## UI でできること

- 最近の thread 一覧と resume
- デスクトップ Codex セッションをスマホから操作
- shared bridge-managed thread による PC/スマホ間の継続利用
- model、plugin、config、auth、automation の確認
- 次 turn 向けの承認・sandbox mode 切り替え
- repository artifact preview
- chat と artifact の Markdown rendering
- browser 画像添付を `localImage` input として Codex に渡す
- 設定 panel から simple / cyberpunk / botanical / Stigmata のカラーテーマを切り替え
- bridge-managed thread を LAN 内の複数端末で共有
