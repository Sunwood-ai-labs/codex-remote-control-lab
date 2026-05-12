# コントリビュートと上流PR

この project では、2つの流れを分けます。

- この repo 内の通常開発: `AGENTS.md` の Git Flow ルールに従う
- 元リポへの上流PR: 小さく、公開安全で、再利用可能な差分だけを送る

## Source of Truth

`AGENTS.md` は local agent / maintainer 向けの repository workflow SOT です。`CONTRIBUTING.md` とこのページは公開向け contribution SOT です。workflow、挙動、公開安全ルールを変えたら、同じ変更で README/docs も更新します。

## 通常開発

統合先は `develop` です。通常の機能追加は `develop` から `feature/<short-description>` branch を切り、完了後に `develop` へ戻します。`main` へ push するのは release / hotfix flow のときだけです。

handoff 前に、変更内容に合う focused check を実行します。code 変更なら通常は次です。

```bash
npm run check
```

docs 変更なら次も実行します。

```bash
npm run docs:build
```

## 公開安全 checklist

local 専用または sensitive なファイルは commit しません。

- `.codex-home*`
- `.phone-token`
- `.phone-workspaces.json`
- `.uploads/`
- logs
- generated session databases
- local `.env` credentials や webhook URL

example は localhost-first を維持します。Codex app-server は `127.0.0.1` に閉じ、LAN に出すのは token-protected bridge だけにします。

## 上流PR

この repository が fork の場合でも、元リポへPRを作れます。条件は、その変更が元リポでも再利用でき、private な local setup に依存せず、review しやすい小さな差分になっていることです。

推奨 flow:

1. `git remote -v` で fork remote と upstream remote を確認する。
2. upstream remote を fetch する。
3. upstream の target branch から branch を切る。
4. 再利用可能な commit または hunk だけを移植する。
5. focused verification command を実行する。
6. fork に branch を push する。
7. fork branch から upstream repository へPRを開く。

local workflow glue、private notification setup、token、machine-specific path、generated session data は upstream に送らないでください。fork 側の差分が大きい場合は、PRを小さく分けるか、先に upstream issue で方針確認します。
