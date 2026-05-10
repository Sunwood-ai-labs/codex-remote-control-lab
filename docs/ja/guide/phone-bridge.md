# Phone Bridge

Phone bridge は Codex app-server をローカルで起動し、`/readyz` を待ってから LAN 用の小さな HTTP/WebSocket bridge を立ち上げます。

## 起動

```bash
npm ci
npm run phone
```

次のような URL が表示されます。

```text
http://192.168.11.8:45214/?token=...
```

同じネットワーク上のスマホや別ブラウザから、その URL をそのまま開きます。

## 構成

```text
phone browser
  -> token-protected bridge on 0.0.0.0:45214
  -> Codex app-server on ws://127.0.0.1:45213
```

複数ブラウザで同じ bridge thread を共有できます。既存 thread を指定するときは `thread=<thread_id>` を URL に足します。

## 環境変数

```bash
PHONE_UI_PORT=45214 npm run phone
CODEX_WORKDIR=/Users/admin/Prj/some-project npm run phone
CODEX_MODEL=gpt-5.4 npm run phone
PHONE_TOKEN=choose-your-own-token npm run phone
```

## UI でできること

- 最近の thread 一覧と resume
- model、plugin、config、auth、automation の確認
- 次 turn 向けの承認・sandbox mode 切り替え
- repository artifact preview
- chat と artifact の Markdown rendering
- browser 画像添付を `localImage` input として Codex に渡す
- 設定 panel から simple / cyberpunk / botanical のカラーテーマを切り替え
- bridge-managed thread を LAN 内の複数端末で共有
