---
layout: home
hero:
  name: Codex Remote Control Lab
  text: デスクトップの Codex セッションをスマホから操作
  tagline: Codex 本体は localhost に閉じ、token 付き LAN bridge だけを公開。PC とスマホで同じ thread を継続できます。
  image:
    src: /logo.svg
    alt: Codex Remote Control Lab icon
  actions:
    - theme: brand
      text: Bridge を起動
      link: /ja/guide/phone-bridge
    - theme: alt
      text: 安全設計
      link: /ja/guide/security
features:
  - title: localhost 優先
    details: Codex app-server は 127.0.0.1 に bind し、LAN に出すのは Node bridge だけです。
  - title: スマホリモコン
    details: スマホのブラウザから、デスクトップ側で動いている Codex app-server を操作できます。
  - title: セッション同期
    details: bridge-managed thread を PC とスマホで共有し、同じ Codex 作業をどちらの端末からでも継続できます。
  - title: 公開安全
    details: token、upload、Codex home、log、session database は Git に入れない前提で整理しています。
---

<p align="center">
  <img src="../assets/codex-remote-control-lab-header.png" alt="Codex Remote Control Lab" style="width:100%;height:auto;">
</p>

## Quick Start

```bash
npm ci
npm run phone
```

Mac に表示された URL を、同じ Wi-Fi/LAN 上のスマホや別ブラウザで開きます。スマホからデスクトップの Codex セッションを操作でき、別ブラウザでも同じ bridge-managed thread を resume できます。

protocol だけを確認する場合は、別 terminal で app-server と probe を動かします。

```bash
npm run server:ws
npm run probe:ws
```
