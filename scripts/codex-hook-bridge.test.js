const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");
const WebSocket = require("ws");

const root = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForText(stream, pattern, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let body = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${pattern}`));
    }, timeoutMs);
    const onData = (chunk) => {
      body += chunk.toString();
      if (pattern.test(body)) {
        cleanup();
        resolve(body);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
    };
    stream.on("data", onData);
  });
}

function startFakeAppServer() {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (!msg.id) return;
      if (msg.method === "thread/start") {
        ws.send(JSON.stringify({ id: msg.id, result: { thread: { id: "thread-hook", turns: [] } } }));
        return;
      }
      if (msg.method === "thread/list" || msg.method === "thread/loaded/list" || msg.method === "model/list") {
        ws.send(JSON.stringify({ id: msg.id, result: { data: [] } }));
        return;
      }
      ws.send(JSON.stringify({ id: msg.id, result: {} }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `ws://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function postJson(port, body) {
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${port}/api/codex-hook`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(data.length),
        },
      },
      (res) => {
        let response = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          response += chunk;
        });
        res.on("end", () => resolve({ statusCode: res.statusCode, body: JSON.parse(response) }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

test("Codex hook endpoint broadcasts shared session state to bridge clients", { timeout: 15000 }, async () => {
  const fakeApp = await startFakeAppServer();
  const uiPort = await freePort();
  const child = spawn(process.execPath, ["scripts/start-phone.js"], {
    cwd: root,
    env: {
      ...process.env,
      PHONE_UI_PORT: String(uiPort),
      PHONE_DEBUG_NO_TOKEN: "1",
      CODEX_APP_SERVER_URL: fakeApp.url,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ws;
  try {
    await waitForText(child.stdout, /Codex shared browser bridge is ready\./);
    ws = new WebSocket(`ws://127.0.0.1:${uiPort}/bridge`);
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("bridge ready timeout")), 8000);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ready") {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      ws.on("error", reject);
    });
    assert.equal(ready.threadId, "thread-hook");

    const statePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("sessionState timeout")), 8000);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "sessionState") {
          clearTimeout(timer);
          resolve(msg.state);
        }
      });
    });
    const response = await postJson(uiPort, {
      hook_event_name: "UserPromptSubmit",
      session_id: "thread-hook",
      turn_id: "turn-hook",
      cwd: root,
      prompt: "hello",
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.state.status, "running");
    const state = await statePromise;
    assert.equal(state.status, "running");
    assert.equal(state.sessionId, "thread-hook");
  } finally {
    if (ws) ws.close();
    child.kill("SIGTERM");
    await fakeApp.close();
  }
});
