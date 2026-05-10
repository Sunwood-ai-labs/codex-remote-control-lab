const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const root = path.resolve(__dirname, "..");
const codexBin = path.join(root, "node_modules", ".bin", "codex");
const uiPort = Number(process.env.PHONE_UI_PORT || 45214);
const codexPort = Number(process.env.CODEX_APP_SERVER_PORT || 45213);
const codexUrl = `ws://127.0.0.1:${codexPort}`;
const workdir = process.env.CODEX_WORKDIR || root;
const model = process.env.CODEX_MODEL || "gpt-5.4";
const tokenPath = path.join(root, ".phone-token");

function getToken() {
  if (process.env.PHONE_TOKEN) return process.env.PHONE_TOKEN;
  if (fs.existsSync(tokenPath)) return fs.readFileSync(tokenPath, "utf8").trim();
  const token = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
  return token;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

function waitForReady() {
  const url = `http://127.0.0.1:${codexPort}/readyz`;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - started > 10_000) reject(new Error("Codex app-server did not become ready"));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

function startCodexServer() {
  const child = spawn(codexBin, ["app-server", "--listen", codexUrl], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${path.join(root, "node_modules", ".bin")}:${process.env.PATH || ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[codex] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[codex] ${chunk}`));
  child.on("exit", (code, signal) => {
    console.error(`[codex] exited code=${code} signal=${signal}`);
  });
  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });
  return child;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const file = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const target = path.join(root, "public", file);
  if (!target.startsWith(path.join(root, "public")) || !fs.existsSync(target)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const type = target.endsWith(".js")
    ? "application/javascript"
    : target.endsWith(".css")
      ? "text/css"
      : "text/html";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  fs.createReadStream(target).pipe(res);
}

function createBridge(browser, phoneToken) {
  let nextId = 1;
  let threadId = null;
  let activeTurnId = null;
  const pending = new Map();
  const upstream = new WebSocket(codexUrl);

  const emit = (type, payload = {}) => {
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify({ type, ...payload }));
  };

  const request = (method, params) => {
    const id = nextId++;
    upstream.send(JSON.stringify({ id, method, params }));
    return id;
  };

  upstream.on("open", () => {
    request("initialize", {
      clientInfo: {
        name: "codex-phone-bridge",
        title: "Codex Phone Bridge",
        version: "0.1.0",
      },
    });
    upstream.send(JSON.stringify({ method: "initialized", params: {} }));
    const id = request("thread/start", {
      model,
      cwd: workdir,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    });
    pending.set(id, "thread/start");
    emit("status", { text: "Codexに接続中..." });
  });

  upstream.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.id && pending.get(msg.id) === "thread/start") {
      pending.delete(msg.id);
      if (msg.error) {
        emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
        return;
      }
      threadId = msg.result.thread.id;
      emit("ready", { threadId, model, workdir });
      return;
    }

    if (msg.id && pending.get(msg.id) === "turn/start") {
      pending.delete(msg.id);
      if (msg.error) emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
      else {
        activeTurnId = msg.result.turn.id;
        emit("turn", { status: "started", turnId: activeTurnId });
      }
      return;
    }

    if (msg.method === "item/agentMessage/delta") {
      emit("assistantDelta", { text: msg.params.delta });
      return;
    }

    if (msg.method === "turn/completed") {
      activeTurnId = null;
      emit("turn", { status: "completed", turnId: msg.params.turnId });
      return;
    }

    if (msg.method && msg.method.endsWith("/requestApproval")) {
      emit("approval", { request: msg });
      return;
    }

    if (msg.method === "error") {
      emit("error", { text: msg.params.message || JSON.stringify(msg.params) });
      return;
    }

    emit("event", { event: msg });
  });

  upstream.on("error", (error) => emit("error", { text: error.message }));
  upstream.on("close", () => emit("status", { text: "Codex接続が閉じました" }));
  browser.on("close", () => upstream.close());

  browser.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.token !== phoneToken) {
      emit("error", { text: "Invalid token" });
      browser.close();
      return;
    }

    if (msg.type === "prompt") {
      if (!threadId) {
        emit("error", { text: "Thread is not ready yet" });
        return;
      }
      const id = request("turn/start", {
        threadId,
        input: [{ type: "text", text: msg.text, text_elements: [] }],
      });
      pending.set(id, "turn/start");
      emit("user", { text: msg.text });
      return;
    }

    if (msg.type === "approval") {
      const requestMsg = msg.request;
      if (!requestMsg || !requestMsg.id || !requestMsg.method) return;
      const accept = msg.decision === "accept";
      let result;
      if (requestMsg.method === "item/commandExecution/requestApproval") {
        result = { decision: accept ? "accept" : "decline" };
      } else if (requestMsg.method === "item/fileChange/requestApproval") {
        result = { decision: accept ? "accept" : "decline" };
      } else {
        result = accept ? { decision: "accept" } : { decision: "decline" };
      }
      upstream.send(JSON.stringify({ id: requestMsg.id, result }));
      emit("status", { text: accept ? "承認しました" : "拒否しました" });
    }
  });
}

async function main() {
  const phoneToken = getToken();
  const codex = startCodexServer();
  await waitForReady();

  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/info")) {
      sendJson(res, 200, { model, workdir, codexUrl, tokenRequired: true });
      return;
    }
    serveStatic(req, res);
  });

  const wss = new WebSocket.Server({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== "/bridge") {
      socket.destroy();
      return;
    }
    if (url.searchParams.get("token") !== phoneToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => createBridge(ws, phoneToken));
  });

  server.listen(uiPort, "0.0.0.0", () => {
    console.log("");
    console.log("Codex phone bridge is ready.");
    for (const address of lanAddresses()) {
      console.log(`  http://${address}:${uiPort}/?token=${phoneToken}`);
    }
    console.log("");
    console.log(`Workdir: ${workdir}`);
    console.log(`Model:   ${model}`);
    console.log("Press Ctrl+C to stop.");
  });

  process.on("exit", () => codex.kill("SIGINT"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
