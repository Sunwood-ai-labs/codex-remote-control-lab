# launchd examples

`ops/launchd/*.plist.example` は、任意の 2 process 構成の例です。

- 1 つ目の job が Codex app-server を `ws://127.0.0.1:45213` に閉じて起動します。
- 2 つ目の job が token-protected phone bridge を起動し、その local app-server へ接続します。

使う場合は、example を repository の外へコピーし、placeholder を置き換えて、実値入りファイルは local-only として扱ってください。

置き換える placeholder:

- `<repo-root>`: local clone の absolute path
- `<log-dir>`: local log directory の absolute path

実値入り launchd file は commit しないでください。local folder name、local log path、notification topic、その他の machine-specific value を含み得ます。

example では Codex app-server を localhost に残します。trusted LAN client から到達させる想定があるのは phone bridge だけで、bridge は既定で token-protected のままです。
