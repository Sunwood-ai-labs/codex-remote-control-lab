<p align="center">
  <img src="docs/public/social-card.svg" alt="Codex Remote Control Lab" width="860">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://sunwood-ai-labs.github.io/codex-remote-control-lab/ja/">Docs</a> ·
  <a href="https://github.com/Sunwood-ai-labs/codex-remote-control-lab">GitHub</a>
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933">
  <img alt="Codex CLI" src="https://img.shields.io/badge/Codex%20CLI-0.130.0-111111">
  <img alt="License" src="https://img.shields.io/badge/License-ISC-blue">
  <img alt="Public safe" src="https://img.shields.io/badge/Public--safe-localhost%20first-41d6a4">
</p>

# Codex Remote Control Lab

Codex Remote Control Lab は、OpenAI Codex CLI の `remote-control` / `app-server` をローカル優先で試すための実験 repo です。Codex app-server は `127.0.0.1` に閉じ、同じ LAN 上の端末へは token 付きの小さな browser bridge だけを公開します。

## ✨ できること

- repo-local の Codex CLI `0.130.0` app-server を起動
- スマホ向け browser UI で thread resume、artifact preview、承認、model 選択、画像添付、カラーテーマ切替を扱う
- phone と desktop browser で 1 つの bridge-managed Codex thread を共有
- `.phone-token`、`.uploads/`、`.codex-home*/`、log、session database を Git に入れない
- VitePress と GitHub Pages で日英 docs を公開

## 🚀 Quick Start

```bash
git clone https://github.com/Sunwood-ai-labs/codex-remote-control-lab.git
cd codex-remote-control-lab
npm ci
npm run phone
```

次のような URL が表示されます。

```text
http://192.168.11.8:45214/?token=...
```

同じ Wi-Fi/LAN 上のスマホで、その URL をそのまま開きます。

## 🧭 構成

```text
phone browser -> http://Mac-LAN-IP:45214 -> Node bridge -> ws://127.0.0.1:45213 -> Codex app-server
```

安全境界は意図的です。Codex app-server は localhost に残し、LAN に出るのは token-protected bridge だけです。

## 🧪 検証コマンド

```bash
npm run check
npm run docs:build
npm audit --omit=dev
```

protocol だけを smoke test する場合:

```bash
npm run server:ws
npm run probe:ws
```

local smoke test では、WebSocket app-server 経由の `initialize` / `thread/start` と、`/readyz` / `/healthz` の挙動を確認しています。

## 📱 Phone Bridge

便利な環境変数:

```bash
PHONE_UI_PORT=45214 npm run phone
CODEX_WORKDIR=/Users/admin/Prj/some-project npm run phone
CODEX_MODEL=gpt-5.4 npm run phone
PHONE_TOKEN=choose-your-own-token npm run phone
```

現在の bridge は次をサポートします。

- Codex Desktop 風の sidebar / conversation / artifact panel / composer layout
- 最近の thread 一覧と直接 resume
- plugin、model、config/auth、automation status panel
- 次 turn 向けの approval / sandbox mode control
- chat と artifact preview の Markdown rendering
- Markdown image link の inline rendering
- browser で選んだ画像を Codex `localImage` input として送信
- local repository image artifact を token-protected file route から表示
- status/tool log の折りたたみ表示
- simple / cyberpunk / botanical のカラーテーマを browser local storage に保存

## 🖼️ UI Evidence

Desktop-like layout:

![Desktop-like UI desktop screenshot](docs/assets/desktop-like-ui-desktop.png)

Mobile layout:

![Desktop-like UI mobile screenshot](docs/assets/desktop-like-ui-mobile.png)

Compact chat typography with image-link preview:

![Compact chat font with image preview screenshot](docs/assets/chat-font-image-preview.png)

Mobile responsive chat check:

![Mobile responsive chat screenshot](docs/assets/mobile-responsive-chat.png)

Mobile responsive drawer check:

![Mobile responsive drawer screenshot](docs/assets/mobile-responsive-drawer.png)

Theme selector on mobile:

![Cyberpunk theme settings screenshot](docs/assets/theme-cyberpunk-mobile-settings.png)

追加スクリーンショットは `docs/assets/` と bridge UI の artifact panel から確認できます。

## 🔐 Safety Notes

- Codex app-server は `127.0.0.1` に保ちます。
- 認証なしの Codex app-server を LAN や public interface に直接 bind しないでください。
- trusted LAN 外から使う場合は SSH forwarding、VPN、mesh network を優先してください。
- shared network で demo した後は `.phone-token` を削除するか `PHONE_TOKEN` を変更してください。

公開安全 checklist は [SECURITY.md](SECURITY.md) にあります。

## 📚 Documentation

- [English docs](https://sunwood-ai-labs.github.io/codex-remote-control-lab/)
- [日本語ドキュメント](https://sunwood-ai-labs.github.io/codex-remote-control-lab/ja/)
- [Phone bridge guide](docs/ja/guide/phone-bridge.md)
- [Protocol notes](docs/ja/guide/protocol.md)
- [Security model](docs/ja/guide/security.md)

## 🗂️ Repository Layout

```text
public/              Phone bridge が配信する browser UI
scripts/             Codex app-server probe と bridge launcher
docs/                VitePress docs と screenshot assets
docs/assets/         UI verification screenshots
docs/public/         docs/README 用 identity assets
.github/workflows/   CI と GitHub Pages deployment
```

## 📄 License

ISC. See [LICENSE](LICENSE).
