const WebSocket = require("ws");

const url = process.env.CODEX_WS_URL || "ws://127.0.0.1:45213";
const model = process.env.CODEX_MODEL || "gpt-5.4";
const events = [];

function record(direction, message) {
  events.push({ direction, message });
}

function finish(code) {
  console.log(JSON.stringify(events, null, 2));
  process.exit(code);
}

const ws = new WebSocket(url);
const timeout = setTimeout(() => {
  record("client", { error: "timeout waiting for thread/start response" });
  finish(2);
}, 5000);

function send(message) {
  ws.send(JSON.stringify(message));
  record("client", message);
}

ws.on("open", () => {
  send({
    method: "initialize",
    id: 1,
    params: {
      clientInfo: {
        name: "codex-remote-control-lab",
        title: "Codex Remote Control Lab",
        version: "0.1.0",
      },
    },
  });
  send({ method: "initialized", params: {} });
  send({
    method: "thread/start",
    id: 2,
    params: { model, cwd: process.cwd() },
  });
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());
  record("server", message);

  if (message.id === 2 || message.error) {
    clearTimeout(timeout);
    ws.close();
    finish(message.error ? 1 : 0);
  }
});

ws.on("error", (error) => {
  clearTimeout(timeout);
  record("client", { error: error.message });
  finish(1);
});
