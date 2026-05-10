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
const bridges = new Map();

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
    const retry = () => {
      if (Date.now() - started > 10_000) reject(new Error("Codex app-server did not become ready"));
      else setTimeout(tick, 250);
    };
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
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

function appServerRequest(method, params) {
  return new Promise((resolve, reject) => {
    let nextId = 1;
    const pending = new Map();
    const upstream = new WebSocket(codexUrl);
    const timeout = setTimeout(() => {
      upstream.close();
      reject(new Error(`${method} timed out`));
    }, 8000);

    const request = (requestMethod, requestParams) => {
      const id = nextId++;
      pending.set(id, requestMethod);
      upstream.send(JSON.stringify({ id, method: requestMethod, params: requestParams }));
    };

    upstream.on("open", () => {
      request("initialize", {
        clientInfo: { name: "codex-phone-bridge", title: "Codex Phone Bridge", version: "0.1.0" },
      });
      upstream.send(JSON.stringify({ method: "initialized", params: {} }));
      request(method, params);
    });

    upstream.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (!msg.id || pending.get(msg.id) !== method) return;
      clearTimeout(timeout);
      upstream.close();
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    });

    upstream.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
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

function summarizeItem(item) {
  if (item.type === "userMessage") {
    return {
      type: "user",
      text: item.content.map((part) => (part.type === "text" ? part.text : `[${part.type}]`)).join("\n"),
    };
  }
  if (item.type === "agentMessage") return { type: "assistant", text: item.text };
  if (item.type === "commandExecution") return { type: "status", text: `$ ${item.command}` };
  if (item.type === "fileChange") return { type: "status", text: `file changes: ${item.status}` };
  return null;
}

function historyFromThread(thread) {
  const history = [];
  for (const turn of thread.turns || []) {
    for (const item of turn.items || []) {
      const entry = summarizeItem(item);
      if (entry && entry.text) history.push(entry);
    }
  }
  return history.slice(-80);
}

class SharedBridge {
  constructor(requestedThreadId) {
    this.requestedThreadId = requestedThreadId;
    this.clients = new Set();
    this.nextId = 1;
    this.pending = new Map();
    this.threadId = null;
    this.activeTurnId = null;
    this.ready = false;
    this.history = [];
    this.upstream = new WebSocket(codexUrl);
    this.bindUpstream();
  }

  addClient(browser) {
    this.clients.add(browser);
    this.emitTo(browser, "status", { text: "共有Codexブリッジに参加しました。" });
    if (this.ready) {
      this.emitTo(browser, "ready", this.readyPayload());
    }
    browser.on("close", () => {
      this.clients.delete(browser);
      if (this.clients.size === 0 && this.ready && this.requestedThreadId) {
        this.upstream.close();
        bridges.delete(this.requestedThreadId);
      }
    });
  }

  readyPayload() {
    return {
      threadId: this.threadId,
      model,
      workdir,
      shared: true,
      clients: this.clients.size,
      history: this.history,
    };
  }

  emit(type, payload = {}) {
    const body = JSON.stringify({ type, ...payload });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(body);
    }
  }

  emitTo(client, type, payload = {}) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type, ...payload }));
  }

  request(method, params) {
    const id = this.nextId++;
    this.upstream.send(JSON.stringify({ id, method, params }));
    return id;
  }

  bindUpstream() {
    this.upstream.on("open", () => {
      this.request("initialize", {
        clientInfo: { name: "codex-phone-bridge", title: "Codex Phone Bridge", version: "0.1.0" },
      });
      this.upstream.send(JSON.stringify({ method: "initialized", params: {} }));
      const method = this.requestedThreadId ? "thread/resume" : "thread/start";
      const params = this.requestedThreadId
        ? {
            threadId: this.requestedThreadId,
            model,
            cwd: workdir,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          }
        : {
            model,
            cwd: workdir,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          };
      const id = this.request(method, params);
      this.pending.set(id, method);
      this.emit("status", { text: this.requestedThreadId ? "既存threadを再開中..." : "新しいthreadを開始中..." });
    });

    this.upstream.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      const pendingMethod = this.pending.get(msg.id);

      if (pendingMethod === "thread/start" || pendingMethod === "thread/resume") {
        this.pending.delete(msg.id);
        if (msg.error) {
          this.emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
          return;
        }
        this.threadId = msg.result.thread.id;
        this.ready = true;
        this.history = historyFromThread(msg.result.thread);
        this.emit("ready", this.readyPayload());
        if (this.requestedThreadId) this.emit("status", { text: `既存threadを再開しました: ${this.threadId}` });
        return;
      }

      if (pendingMethod === "turn/start") {
        this.pending.delete(msg.id);
        if (msg.error) this.emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
        else {
          this.activeTurnId = msg.result.turn.id;
          this.emit("turn", { status: "started", turnId: this.activeTurnId });
        }
        return;
      }

      if (msg.method === "item/agentMessage/delta") {
        this.emit("assistantDelta", { text: msg.params.delta });
        return;
      }

      if (msg.method === "item/completed") {
        const entry = summarizeItem(msg.params.item);
        if (entry) this.history.push(entry);
        this.emit("event", { event: msg });
        return;
      }

      if (msg.method === "turn/completed") {
        this.activeTurnId = null;
        this.emit("turn", { status: "completed", turnId: msg.params.turnId });
        return;
      }

      if (msg.method && msg.method.endsWith("/requestApproval")) {
        this.emit("approval", { request: msg });
        return;
      }

      if (msg.method === "error") {
        this.emit("error", { text: msg.params.message || JSON.stringify(msg.params) });
        return;
      }

      this.emit("event", { event: msg });
    });

    this.upstream.on("error", (error) => this.emit("error", { text: error.message }));
    this.upstream.on("close", () => this.emit("status", { text: "Codex接続が閉じました" }));
  }

  prompt(text) {
    if (!this.threadId) {
      this.emit("error", { text: "Thread is not ready yet" });
      return;
    }
    const id = this.request("turn/start", {
      threadId: this.threadId,
      input: [{ type: "text", text, text_elements: [] }],
    });
    this.pending.set(id, "turn/start");
    this.history.push({ type: "user", text });
    this.emit("user", { text });
  }

  approval(requestMsg, decision) {
    if (!requestMsg || !requestMsg.id || !requestMsg.method) return;
    const accept = decision === "accept";
    let result;
    if (requestMsg.method === "item/commandExecution/requestApproval") {
      result = { decision: accept ? "accept" : "decline" };
    } else if (requestMsg.method === "item/fileChange/requestApproval") {
      result = { decision: accept ? "accept" : "decline" };
    } else {
      result = accept ? { decision: "accept" } : { decision: "decline" };
    }
    this.upstream.send(JSON.stringify({ id: requestMsg.id, result }));
    this.emit("status", { text: accept ? "承認しました" : "拒否しました" });
  }
}

function getBridge(threadId) {
  const key = threadId || "default";
  if (!bridges.has(key)) bridges.set(key, new SharedBridge(threadId));
  return bridges.get(key);
}

function bindBrowser(browser, phoneToken, threadId) {
  const bridge = getBridge(threadId);
  bridge.addClient(browser);

  browser.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.token !== phoneToken) {
      bridge.emitTo(browser, "error", { text: "Invalid token" });
      browser.close();
      return;
    }
    if (msg.type === "prompt") bridge.prompt(msg.text);
    if (msg.type === "approval") bridge.approval(msg.request, msg.decision);
  });
}

async function main() {
  const phoneToken = getToken();
  const codex = startCodexServer();
  await waitForReady();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/info") {
      sendJson(res, 200, { model, workdir, codexUrl, tokenRequired: true });
      return;
    }
    if (url.pathname === "/api/threads") {
      if (url.searchParams.get("token") !== phoneToken) {
        sendJson(res, 401, { error: "invalid token" });
        return;
      }
      try {
        const result = await appServerRequest("thread/list", {
          limit: 30,
          sortKey: "updated_at",
          sortDirection: "desc",
          archived: false,
          useStateDbOnly: true,
        });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
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
    const threadId = url.searchParams.get("thread") || null;
    wss.handleUpgrade(req, socket, head, (ws) => bindBrowser(ws, phoneToken, threadId));
  });

  server.listen(uiPort, "0.0.0.0", () => {
    console.log("");
    console.log("Codex shared browser bridge is ready.");
    for (const address of lanAddresses()) {
      console.log(`  http://${address}:${uiPort}/?token=${phoneToken}`);
    }
    console.log("");
    console.log(`Workdir: ${workdir}`);
    console.log(`Model:   ${model}`);
    console.log("Open the same URL from PC and phone to share one bridge thread.");
    console.log("Press Ctrl+C to stop.");
  });

  process.on("exit", () => codex.kill("SIGINT"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
