# Codex Remote Control Lab

This repository is a small, isolated lab for OpenAI Codex CLI `0.130.0`.

## What Was Verified

- The globally active Codex CLI on this Mac is still `0.128.0`.
- `@openai/codex@0.130.0` is installed locally in this repository, so experiments do not replace the user's main CLI.
- `codex --help` in `0.130.0` includes the new `remote-control` command.
- `codex remote-control --help` describes it as an experimental headless app-server entrypoint.
- `codex remote-control` starts a foreground app-server with local transports disabled. It does not open a TCP listener by itself.
- `codex app-server --listen ws://127.0.0.1:45213` starts a localhost WebSocket server and exposes `/readyz` and `/healthz`.
- A minimal WebSocket client can perform `initialize` and `thread/start`, creating a thread under the isolated `CODEX_HOME`.

## Commands

Use the repository-local Codex binary:

```bash
cd /Users/admin/Prj/codex-remote-control-lab
export PATH="$PWD/node_modules/.bin:$PATH"
```

Check the installed version and the new command:

```bash
npm run version:codex
npm run help:remote-control
```

Try `remote-control` without touching the global Codex home:

```bash
mkdir -p .codex-home-remote
CODEX_HOME="$PWD/.codex-home-remote" codex remote-control
```

Run the experimental WebSocket app-server:

```bash
npm run server:ws
```

In another terminal:

```bash
curl -i http://127.0.0.1:45213/readyz
curl -i http://127.0.0.1:45213/healthz
npm run probe:ws
```

## Use From A Phone On The Local Network

Start the phone bridge on the Mac:

```bash
cd /Users/admin/Prj/codex-remote-control-lab
npm run phone
```

The command prints a phone URL like:

```text
http://192.168.11.8:45214/?token=...
```

Open that exact URL from a phone connected to the same Wi-Fi/LAN.

The bridge uses this safer layout:

```text
phone browser -> http://Mac-LAN-IP:45214 -> Node bridge -> ws://127.0.0.1:45213 -> Codex app-server
```

So Codex's app-server remains bound to `127.0.0.1`; only the small phone UI is reachable from the LAN. A random token is stored in `.phone-token` and required by both the page URL and WebSocket bridge.

Useful environment variables:

```bash
PHONE_UI_PORT=45214 npm run phone
CODEX_WORKDIR=/Users/admin/Prj/some-project npm run phone
CODEX_MODEL=gpt-5.4 npm run phone
PHONE_TOKEN=choose-your-own-token npm run phone
```

The current phone bridge supports:

- starting a Codex thread
- sending prompts from the phone
- streaming assistant text back to the phone
- showing command/file-change approval requests with approve/decline buttons

The bridge was smoke-tested locally by sending `Reply exactly: PHONE_BRIDGE_OK` through the phone WebSocket path and receiving `PHONE_BRIDGE_OK`.

## Observed WebSocket Behavior

The health probes returned:

- `GET /readyz`: `200 OK`
- `GET /healthz`: `200 OK`
- `GET /healthz` with an `Origin` header: `403 Forbidden`

The probe script received:

- an `initialize` result containing `cliVersion`-equivalent user agent data for `0.130.0`
- `remoteControl/status/changed` with `status: "disabled"` for the plain WebSocket app-server
- a successful `thread/start` response with a new thread id and `cwd` set to this repository

## Safety Notes

The WebSocket listener should stay on `127.0.0.1` unless authentication and a private network path are configured. For another machine, prefer SSH port forwarding or a VPN/mesh network rather than binding an unauthenticated listener to a public interface.

## Sources Checked

- OpenAI Codex app-server docs: https://developers.openai.com/codex/app-server
- OpenAI Codex remote connections docs: https://developers.openai.com/codex/remote-connections
- Codex `0.130.0` release: https://github.com/openai/codex/releases/tag/rust-v0.130.0
- `remote-control` PR: https://github.com/openai/codex/pull/21424
