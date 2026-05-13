const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const { bridgeKeyForRequest, shouldDisposeIdleBridge, shouldPromoteBridgeKey } = require("./bridge-state");
const { isHistorySyncEnabled, runHistorySync } = require("./history-sync");
const { bridgeUrls, notifyBridgeUrls } = require("./phone-notify");
const { findLiveBridge, readThreadSnapshot } = require("./thread-read");

const root = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

// Walk up from root to find .env — handles git worktrees where root is
// several levels inside the actual project directory.
(function loadEnvWalkUp() {
  let dir = root;
  for (let i = 0; i < 6; i++) {
    loadEnvFile(path.join(dir, ".env"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

const codexBin = path.join(root, "node_modules", ".bin", "codex");
const uiPort = Number(process.env.PHONE_UI_PORT || 45214);
const codexPort = Number(process.env.CODEX_APP_SERVER_PORT || 45213);
const codexSocketPath = process.env.CODEX_APP_SERVER_SOCK || "";
const codexUrl = process.env.CODEX_APP_SERVER_URL || (codexSocketPath ? "ws://codex-app-server/rpc" : `ws://127.0.0.1:${codexPort}`);
const shouldStartCodexServer = !process.env.CODEX_APP_SERVER_URL && !codexSocketPath;
const workdir = path.resolve(process.env.CODEX_WORKDIR || root);
const model = process.env.CODEX_MODEL || "gpt-5.4";
const historySyncEnabled = isHistorySyncEnabled(process.env);
const debugNoToken = /^(1|true|yes|on)$/i.test(process.env.PHONE_DEBUG_NO_TOKEN || "");
const debugBind = (process.env.PHONE_DEBUG_BIND || "").trim().toLowerCase();
const debugLan = debugNoToken && debugBind === "lan";
const authMode = debugNoToken ? "debug-no-token" : "token";
const tokenRequired = authMode === "token";
const listenHost = tokenRequired || debugLan ? "0.0.0.0" : "127.0.0.1";
const tokenPath = path.join(root, ".phone-token");
const uploadDir = path.join(root, ".uploads");
const bridges = new Map();
const historyLimit = 80;
const imageExtensions = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);
const staticMimeTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "application/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

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
    .filter((entry) => entry && (entry.family === "IPv4" || entry.family === 4) && !entry.internal)
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

function createUpstreamWebSocket() {
  if (!codexSocketPath) return new WebSocket(codexUrl);
  return new WebSocket(codexUrl, {
    perMessageDeflate: false,
    createConnection: () => net.createConnection(codexSocketPath),
  });
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function pickCodexError(raw) {
  const value = parseMaybeJson(raw);
  if (!value || typeof value !== "object") return { message: String(raw || "Codex error") };
  if (value.error) return { ...value.error, threadId: value.threadId, turnId: value.turnId };
  if (value.params?.error) return { ...value.params.error, threadId: value.params.threadId, turnId: value.params.turnId };
  return value;
}

function normalizeCodexProblem(raw) {
  const problem = pickCodexError(raw);
  const detail = typeof problem === "string" ? problem : JSON.stringify(problem);
  const message = String(problem.message || problem.additionalDetails || "Codex connection error");
  const streamDisconnected =
    Boolean(problem.codexErrorInfo?.responseStreamDisconnected) || /responseStreamDisconnected|response\.completed/i.test(detail);
  const retrying = Boolean(problem.willRetry) || /^Reconnecting\.\.\./i.test(message);
  if (streamDisconnected && retrying) {
    return {
      severity: "status",
      text: `Codex応答ストリームが一時切断されました。再接続中です。${message ? ` (${message})` : ""}`,
      detail,
      turnId: problem.turnId,
    };
  }
  if (streamDisconnected) {
    return {
      severity: "error",
      text: "Codex応答ストリームが切断されました。再接続後にもう一度送信してください。",
      detail,
      turnId: problem.turnId,
    };
  }
  return {
    severity: "error",
    text: message,
    detail,
    turnId: problem.turnId,
  };
}

class AppServerRpcClient {
  constructor() {
    this.upstream = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.connecting = null;
  }

  request(method, params) {
    return this.ensureReady().then(() => this.sendRequest(method, params));
  }

  ensureReady() {
    if (this.ready && this.upstream?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.upstream = createUpstreamWebSocket();
    this.ready = false;
    this.connecting = new Promise((resolve, reject) => {
      const fail = (error) => {
        this.connecting = null;
        reject(error);
      };

      this.upstream.on("open", () => {
        this.sendRequest("initialize", {
          clientInfo: { name: "codex-phone-bridge-api", title: "Codex Phone Bridge API", version: "0.1.0" },
        })
          .then(() => {
            if (this.upstream?.readyState === WebSocket.OPEN) {
              this.upstream.send(JSON.stringify({ method: "initialized", params: {} }));
            }
            this.ready = true;
            this.connecting = null;
            resolve();
          })
          .catch(fail);
      });

      this.upstream.on("message", (data) => this.handleMessage(data));
      this.upstream.on("error", fail);
      this.upstream.on("close", () => this.reset(new Error("Codex app-server connection closed")));
    });

    return this.connecting;
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
        reject(new Error("Codex app-server connection is not open"));
        return;
      }
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 8000);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.upstream.send(JSON.stringify({ id, method, params }));
    });
  }

  handleMessage(data) {
    const msg = JSON.parse(data.toString());
    if (!msg.id || !this.pending.has(msg.id)) return;
    const pending = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    clearTimeout(pending.timeout);
    if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else pending.resolve(msg.result);
  }

  reset(error) {
    this.ready = false;
    this.connecting = null;
    this.upstream = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const appServerClient = new AppServerRpcClient();

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
  return appServerClient.request(method, params);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function requireToken(url, phoneToken, res) {
  if (!tokenRequired) return true;
  if (url.searchParams.get("token") === phoneToken) return true;
  sendJson(res, 401, { error: "invalid token" });
  return false;
}

function safePathWithin(base, input) {
  const resolvedBase = path.resolve(base);
  const raw = String(input || "");
  const clean = raw.replace(/^[/\\]+/, "");
  const target = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(resolvedBase, clean);
  if (!target.startsWith(`${resolvedBase}${path.sep}`) && target !== resolvedBase) return null;
  return target;
}

function safeRelativePath(input) {
  return safePathWithin(root, input);
}

function safeWorkdirPath(input) {
  return safePathWithin(workdir, input);
}

function safeOpenPath(input) {
  const workspacePath = safeWorkdirPath(input);
  if (workspacePath) {
    try {
      if (fs.statSync(workspacePath).isFile()) return workspacePath;
    } catch {}
  }
  return safeRelativePath(input);
}

function relativeDisplayPath(filePath) {
  const base = filePath.startsWith(`${workdir}${path.sep}`) || filePath === workdir ? workdir : root;
  return path.relative(base, filePath);
}

function safeUploadPath(input) {
  const clean = String(input || "").replace(/^[/\\]+/, "");
  const target = path.resolve(uploadDir, clean);
  if (!target.startsWith(`${uploadDir}${path.sep}`) && target !== uploadDir) return null;
  return target;
}

function mimeForPath(filePath) {
  return imageExtensions.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function isImagePath(filePath) {
  return imageExtensions.has(path.extname(filePath).toLowerCase());
}

function discoverArtifacts() {
  const files = ["README.md", "AGENTS.md"];
  const assetsDir = path.join(root, "docs", "assets");
  if (fs.existsSync(assetsDir)) {
    for (const name of fs.readdirSync(assetsDir).sort()) {
      const relative = path.join("docs", "assets", name);
      const full = path.join(root, relative);
      if (fs.statSync(full).isFile() && (isImagePath(full) || /\.md(?:own)?$/i.test(name))) files.push(relative);
    }
  }
  return files.map((file) => ({
    path: file,
    name: path.basename(file),
    kind: isImagePath(file) ? "image" : /\.md(?:own)?$/i.test(file) ? "markdown" : "file",
  }));
}

const ignoredWorkspaceNames = new Set([
  ".git",
  ".claude",
  ".codex-home",
  ".uploads",
  "node_modules",
  "coverage",
  "dist",
]);

function shouldSkipWorkspaceEntry(name) {
  return ignoredWorkspaceNames.has(name) || /^\.codex-home/.test(name) || /^\.phone-token/.test(name) || /^\.env(?:\.|$)/.test(name);
}

function workspaceKind(filePath, stat) {
  if (stat.isDirectory()) return "directory";
  if (isImagePath(filePath)) return "image";
  if (/\.md(?:own)?$/i.test(filePath)) return "markdown";
  return "file";
}

function artifactKindForPath(filePath) {
  if (isImagePath(filePath)) return "image";
  if (/\.md(?:own)?$/i.test(filePath)) return "markdown";
  return "file";
}

async function discoverWorkspaceEntries({ limit = 200, query = "" } = {}) {
  const entries = [];
  const normalizedQuery = query.trim().toLowerCase();
  const maxEntries = Math.max(1, Math.min(Number(limit) || 200, 500));

  async function walk(dir, depth) {
    if (entries.length >= maxEntries || depth > 5) return;
    let children;
    try {
      children = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    children = children
      .filter((entry) => !shouldSkipWorkspaceEntry(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    for (const child of children) {
      if (entries.length >= maxEntries) return;
      const fullPath = path.join(dir, child.name);
      let stat;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory() && !stat.isFile()) continue;
      const relative = path.relative(workdir, fullPath);
      if (normalizedQuery && !relative.toLowerCase().includes(normalizedQuery)) {
        if (stat.isDirectory()) await walk(fullPath, depth + 1);
        continue;
      }
      entries.push({
        path: relative,
        name: child.name,
        type: stat.isDirectory() ? "directory" : "file",
        kind: workspaceKind(fullPath, stat),
        size: stat.isFile() ? stat.size : null,
      });
      if (stat.isDirectory()) await walk(fullPath, depth + 1);
    }
  }

  await walk(workdir, 0);
  return entries;
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: workdir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`git ${args.join(" ")} timed out`));
    }, 5000);

    child.stdout.on("data", (data) => {
      stdout += data;
      if (stdout.length > 512 * 1024) child.kill("SIGTERM");
    });
    child.stderr.on("data", (data) => {
      stderr += data;
      if (stderr.length > 512 * 1024) child.kill("SIGTERM");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error((stderr || stdout || `git ${args.join(" ")} failed`).trim()));
        return;
      }
      resolve(stdout.replace(/\s+$/g, ""));
    });
  });
}

function shouldSkipReviewPath(filePath) {
  const clean = String(filePath || "").replace(/^[/\\]+/, "").replace(/[\\/]+$/, "");
  return (
    clean === ".claude" ||
    clean.startsWith(".claude/") ||
    clean === ".phone-token" ||
    clean.startsWith(".codex-home") ||
    clean.startsWith(".uploads/") ||
    clean.startsWith("node_modules/")
  );
}

function parseGitPathName(rawPath) {
  let filePath = String(rawPath || "");
  if (!filePath.includes(" => ")) return filePath;
  if (/\{[^}]*\s=>\s[^}]*\}/.test(filePath)) {
    return filePath.replace(/\{[^}]*\s=>\s([^}]*)\}/g, "$1");
  }
  return filePath.split(" => ").pop().replace(/[{}]/g, "");
}

function parseNumstat(numstatText) {
  return new Map(
    numstatText
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [added, deleted, ...rest] = line.split(/\t/);
        const filePath = parseGitPathName(rest.join("\t"));
        return [
          filePath,
          {
            additions: Number(added) || 0,
            deletions: Number(deleted) || 0,
          },
        ];
      }),
  );
}

function parseStatusPorcelain(statusText) {
  const records = String(statusText || "").split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const status = record.slice(0, 2).trim() || "modified";
    const filePath = record.slice(3);
    if (!filePath) continue;
    files.push({ status, path: filePath });
    if (/[RC]/.test(status) && i + 1 < records.length) i += 1;
  }
  return files;
}

async function decorateReviewFiles(files) {
  const decorated = await Promise.all(files
    .filter((file) => !shouldSkipReviewPath(file.path))
    .map(async (file) => {
      const absolutePath = safeWorkdirPath(file.path);
      let openable = false;
      try {
        openable = Boolean(absolutePath && (await fs.promises.stat(absolutePath)).isFile());
      } catch {
        openable = false;
      }
      return {
        ...file,
        kind: openable ? artifactKindForPath(absolutePath) : "file",
        openable,
      };
    }));
  const totals = decorated.reduce(
    (sum, file) => ({
      additions: sum.additions + (file.additions || 0),
      deletions: sum.deletions + (file.deletions || 0),
    }),
    { additions: 0, deletions: 0 },
  );
  return { files: decorated, totals };
}

function workingTreeReviewFiles(statusText, numstatText) {
  const numstat = parseNumstat(numstatText);
  return parseStatusPorcelain(statusText)
    .map((file) => {
      const filePath = parseGitPathName(file.path);
      const stats = numstat.get(filePath) || { additions: 0, deletions: 0 };
      return {
        status: file.status,
        path: filePath,
        additions: stats.additions,
        deletions: stats.deletions,
      };
    });
}

async function lastCommitReviewFiles() {
  const numstat = parseNumstat(await runGit(["show", "--numstat", "--format=", "--no-renames", "HEAD"]));
  const names = (await runGit(["show", "--name-status", "--format=", "--no-renames", "HEAD"]))
    .split(/\r?\n/)
    .filter(Boolean);
  return names.map((line) => {
    const [status, ...rest] = line.split(/\t/);
    const filePath = rest.join("\t");
    const stats = numstat.get(filePath) || { additions: 0, deletions: 0 };
    return {
      status,
      path: filePath,
      additions: stats.additions,
      deletions: stats.deletions,
    };
  });
}

async function reviewSummary() {
  const [branch, statusText, statText, numstatText] = await Promise.all([
    runGit(["branch", "--show-current"]),
    runGit(["status", "--porcelain=v1", "-z"]),
    runGit(["diff", "HEAD", "--stat", "--"]),
    runGit(["diff", "HEAD", "--numstat", "--"]),
  ]);
  const working = await decorateReviewFiles(workingTreeReviewFiles(statusText, numstatText));
  const fallback = working.files.length ? null : await decorateReviewFiles(await lastCommitReviewFiles());
  const source = fallback ? "latest commit" : "working tree";
  const files = fallback?.files || working.files;
  const totals = fallback?.totals || working.totals;
  return {
    branch,
    clean: files.length === 0,
    source,
    files,
    totals,
    stat: statText.split(/\r?\n/).filter(Boolean).slice(0, 20),
  };
}

function readAutomations() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const automationsDir = path.join(home, "automations");
  if (!fs.existsSync(automationsDir)) return [];
  return fs
    .readdirSync(automationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const automationToml = path.join(automationsDir, entry.name, "automation.toml");
      const raw = fs.existsSync(automationToml) ? fs.readFileSync(automationToml, "utf8") : "";
      const name = raw.match(/^name\s*=\s*"([^"]+)"/m)?.[1] || entry.name;
      const status = raw.match(/^status\s*=\s*"([^"]+)"/m)?.[1] || "UNKNOWN";
      return { id: entry.name, name, status };
    });
}

function saveDataUrlAttachment(attachment) {
  const match = String(attachment.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  if (!mime.startsWith("image/")) return null;
  fs.mkdirSync(uploadDir, { recursive: true });
  const extension = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const safeName = String(attachment.name || "upload")
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName || "image"}.${extension}`;
  const target = path.join(uploadDir, fileName);
  fs.writeFileSync(target, Buffer.from(match[2], "base64"), { mode: 0o600 });
  return {
    input: { type: "localImage", path: target },
    preview: { name: attachment.name || fileName, path: fileName, url: `/api/uploaded?name=${encodeURIComponent(fileName)}` },
  };
}

function sandboxPolicyForMode(mode) {
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  if (mode === "read-only") return { type: "readOnly", networkAccess: true };
  return {
    type: "workspaceWrite",
    writableRoots: [workdir],
    networkAccess: true,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
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
  const type = staticMimeTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  fs.createReadStream(target).pipe(res);
}

function stripUiDirectives(text) {
  return String(text || "")
    .replace(/(?:^|\n)::[a-z0-9-]+\{[^\n]*\}(?=\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeItem(item) {
  if (item.type === "userMessage") {
    const textParts = [];
    const attachments = [];
    for (const part of item.content) {
      if (part.type === "text") {
        textParts.push(part.text);
        continue;
      }
      if (part.type === "localImage" && part.path) {
        const absolutePath = path.resolve(part.path);
        if (absolutePath.startsWith(`${uploadDir}${path.sep}`)) {
          attachments.push({
            name: path.basename(absolutePath),
            url: `/api/uploaded?name=${encodeURIComponent(path.basename(absolutePath))}`,
          });
        } else if (absolutePath.startsWith(`${root}${path.sep}`) && isImagePath(absolutePath)) {
          const relative = path.relative(root, absolutePath);
          attachments.push({ name: path.basename(absolutePath), url: `/api/file/raw?path=${encodeURIComponent(relative)}` });
        }
      }
    }
    return {
      type: "user",
      text: textParts.join("\n") || (attachments.length ? "添付画像" : ""),
      attachments,
    };
  }
  if (item.type === "agentMessage") return { type: "assistant", text: stripUiDirectives(item.text) };
  if (item.type === "commandExecution") return { type: "status", text: `$ ${item.command}` };
  if (item.type === "fileChange") return { type: "status", text: `file changes: ${item.status}` };
  return null;
}

function summarizeLiveItem(item, phase = "completed") {
  if (!item) return null;
  if (item.type === "commandExecution") {
    return phase === "started" ? `$ ${item.command}` : null;
  }
  if (item.type === "fileChange") {
    return `file changes: ${item.status}`;
  }
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
  return capHistory(history);
}

function capHistory(history) {
  return history.slice(-historyLimit);
}

class SharedBridge {
  constructor(requestedThreadId, bridgeKey) {
    this.requestedThreadId = requestedThreadId;
    this.bridgeKey = bridgeKey;
    this.clients = new Set();
    this.nextId = 1;
    this.pending = new Map();
    this.threadId = null;
    this.activeTurnId = null;
    this.ready = false;
    this.startupFailed = false;
    this.history = [];
    this.turnQueue = [];
    this.runState = { state: "connecting", label: "接続中", turnId: null, updatedAt: Date.now() };
    this.streamingStarted = false;
    this.interruptRequested = false;
    this.upstream = createUpstreamWebSocket();
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
      if (shouldDisposeIdleBridge({ clientCount: this.clients.size, ready: this.ready })) {
        this.upstream.close();
        bridges.delete(this.bridgeKey);
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
      run: this.runPayload(),
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

  closeBrowserClients() {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.close();
    }
    this.clients.clear();
  }

  markUpstreamClosed(message = "Codex接続が切断されました。再接続してください。") {
    this.ready = false;
    this.activeTurnId = null;
    this.streamingStarted = false;
    this.interruptRequested = false;
    this.pending.clear();
    this.setBridgeRunState("error", message);
    this.emit("error", { text: message });
    this.closeBrowserClients();
    bridges.delete(this.bridgeKey);
  }

  request(method, params) {
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
      this.markUpstreamClosed();
      return null;
    }
    const id = this.nextId++;
    this.upstream.send(JSON.stringify({ id, method, params }));
    return id;
  }

  hasPendingTurnStart() {
    return Array.from(this.pending.values()).includes("turn/start");
  }

  hasPendingTurnInterrupt() {
    return Array.from(this.pending.values()).includes("turn/interrupt");
  }

  setBridgeRunState(state, label, turnId = this.activeTurnId) {
    this.runState = { state, label, turnId: turnId || null, updatedAt: Date.now() };
    this.emit("runState", { run: this.runPayload() });
  }

  runPayload() {
    return this.runState || {
      state: this.ready ? "ready" : "connecting",
      label: this.ready ? "待機中" : "接続中",
      turnId: this.activeTurnId || null,
      updatedAt: Date.now(),
    };
  }

  promoteBridgeKey() {
    if (!shouldPromoteBridgeKey({ bridgeKey: this.bridgeKey, threadId: this.threadId })) return;
    const previousKey = this.bridgeKey;
    if (bridges.has(this.threadId) && bridges.get(this.threadId) !== this) return;
    if (bridges.get(previousKey) !== this) return;
    this.bridgeKey = this.threadId;
    bridges.delete(previousKey);
    bridges.set(this.bridgeKey, this);
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
          this.startupFailed = true;
          this.emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
          return;
        }
        this.threadId = msg.result.thread.id;
        this.startupFailed = false;
        this.promoteBridgeKey();
        this.ready = true;
        this.history = historyFromThread(msg.result.thread);
        this.setBridgeRunState("ready", "待機中");
        this.emit("ready", this.readyPayload());
        if (this.requestedThreadId) this.emit("status", { text: `既存threadを再開しました: ${this.threadId}` });
        return;
      }

      if (pendingMethod === "turn/start") {
        this.pending.delete(msg.id);
        if (msg.error) {
          this.interruptRequested = false;
          const problem = normalizeCodexProblem(msg.error);
          if (problem.turnId) this.activeTurnId = problem.turnId;
          this.emit(problem.severity, { text: problem.text, detail: problem.detail });
          if (problem.severity === "error") this.setBridgeRunState("error", "開始に失敗", this.activeTurnId);
          if (problem.severity === "error") this.startNextQueuedTurn();
        } else {
          this.activeTurnId = msg.result.turn.id;
          this.streamingStarted = false;
          this.setBridgeRunState("running", "Codex 処理中", this.activeTurnId);
          this.emit("turn", { status: "started", turnId: this.activeTurnId, run: this.runPayload() });
          if (this.interruptRequested) this.setBridgeRunState("interrupting", "開始後に中断します", this.activeTurnId);
        }
        return;
      }

      if (pendingMethod === "turn/interrupt") {
        this.pending.delete(msg.id);
        if (msg.error) {
          const problem = normalizeCodexProblem(msg.error);
          this.emit("error", { text: `中断に失敗しました: ${problem.text}`, detail: problem.detail });
          this.setBridgeRunState("error", "中断に失敗", this.activeTurnId);
        } else {
          this.setBridgeRunState("interrupting", "中断中", this.activeTurnId);
        }
        return;
      }

      if (msg.method === "item/agentMessage/delta") {
        this.flushPendingInterrupt();
        this.streamingStarted = true;
        this.setBridgeRunState("streaming", "回答生成中", this.activeTurnId);
        this.emit("assistantDelta", { text: msg.params.delta });
        return;
      }

      if (msg.method === "item/started") {
        this.flushPendingInterrupt();
        const text = summarizeLiveItem(msg.params.item, "started");
        if (text) this.emit("status", { text });
        return;
      }

      if (msg.method === "item/completed") {
        const entry = summarizeItem(msg.params.item);
        if (entry && entry.type !== "user") this.appendHistory(entry);
        const text = summarizeLiveItem(msg.params.item, "completed");
        if (text) this.emit("status", { text });
        this.emit("event", { event: msg });
        return;
      }

      if (msg.method === "turn/completed") {
        const completedTurn = msg.params.turn || {};
        const completedTurnId = msg.params.turnId || completedTurn.id || this.activeTurnId;
        const wasInterrupted = completedTurn.status === "interrupted";
        this.interruptRequested = false;
        this.activeTurnId = null;
        this.streamingStarted = false;
        this.setBridgeRunState(wasInterrupted ? "interrupted" : "done", wasInterrupted ? "中断しました" : "完了しました", completedTurnId);
        this.emit("turn", { status: "completed", turnId: completedTurnId, run: this.runPayload() });
        this.syncHistory("turn completed");
        this.startNextQueuedTurn();
        return;
      }

      if (msg.method && msg.method.endsWith("/requestApproval")) {
        this.setBridgeRunState("approval", "承認待ち", this.activeTurnId);
        this.emit("approval", { request: msg });
        return;
      }

      if (msg.method === "error") {
        this.interruptRequested = false;
        const problem = normalizeCodexProblem(msg.params);
        if (problem.turnId) this.activeTurnId = problem.turnId;
        this.emit(problem.severity, { text: problem.text, detail: problem.detail });
        if (problem.severity === "error") this.setBridgeRunState("error", "エラー", this.activeTurnId);
        return;
      }

      this.emit("event", { event: msg });
    });

    this.upstream.on("error", (error) => {
      if (!this.ready) this.startupFailed = true;
      this.interruptRequested = false;
      this.setBridgeRunState("error", "接続エラー", this.activeTurnId);
      this.emit("error", { text: error.message });
    });
    this.upstream.on("close", () => {
      if (!this.ready) this.startupFailed = true;
      this.markUpstreamClosed("Codex接続が閉じました。再接続ボタンを押してください。");
    });
  }

  sendTurnInterrupt(turnId = this.activeTurnId) {
    if (!this.threadId || !turnId || this.hasPendingTurnInterrupt()) return false;
    const id = this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId,
    });
    if (!id) return false;
    this.pending.set(id, "turn/interrupt");
    this.setBridgeRunState("interrupting", "中断中", turnId);
    this.emit("status", { text: "処理の中断を要求しました。" });
    return true;
  }

  flushPendingInterrupt() {
    if (!this.interruptRequested || !this.activeTurnId) return;
    this.interruptRequested = false;
    this.sendTurnInterrupt(this.activeTurnId);
  }

  interrupt() {
    const queuedCount = this.turnQueue.length;
    this.turnQueue = [];
    if (queuedCount) this.emit("status", { text: `待機中の送信を破棄しました（${queuedCount}件）。` });

    if (this.activeTurnId) {
      try {
        this.interruptRequested = false;
        if (!this.sendTurnInterrupt(this.activeTurnId)) {
          this.emit("status", { text: "中断要求はすでに送信済みです。" });
        }
      } catch (error) {
        this.setBridgeRunState("error", "中断に失敗", this.activeTurnId);
        this.emit("error", { text: `中断要求の送信に失敗しました: ${error.message}` });
      }
      return;
    }

    if (this.hasPendingTurnStart()) {
      this.interruptRequested = true;
      this.setBridgeRunState("interrupting", "開始後に中断します");
      this.emit("status", { text: "開始待ちの処理を中断予約しました。" });
      return;
    }

    if (!queuedCount) this.emit("status", { text: "中断できる処理はありません。" });
  }

  prompt(text, attachments = [], options = {}) {
    if (!this.threadId) {
      this.emit("error", { text: "Thread is not ready yet" });
      return;
    }
    if (this.activeTurnId || this.hasPendingTurnStart()) {
      this.turnQueue.push({ text, attachments, options });
      this.emit("status", { text: `キューに追加しました（${this.turnQueue.length}件待機）` });
      return;
    }
    this.startPrompt(text, attachments, options);
  }

  startNextQueuedTurn() {
    if (!this.ready || this.activeTurnId || this.hasPendingTurnStart() || !this.turnQueue.length) return;
    const next = this.turnQueue.shift();
    this.emit("status", { text: `キューから送信中（残り${this.turnQueue.length}件）` });
    this.startPrompt(next.text, next.attachments, next.options);
  }

  syncHistory(reason) {
    if (!this.threadId || !historySyncEnabled) return;
    runHistorySync({
      threadId: this.threadId,
      workdir,
      request: appServerRequest,
      enabled: historySyncEnabled,
    })
      .then((result) => {
        if (!result.skipped) this.emit("status", { text: `履歴同期を更新しました (${reason})` });
      })
      .catch((error) => {
        this.emit("status", { text: `履歴同期に失敗しました: ${error.message}` });
      });
  }

  startPrompt(text, attachments = [], options = {}) {
    this.interruptRequested = false;
    const input = [{ type: "text", text, text_elements: [] }];
    const savedImages = [];
    for (const attachment of attachments || []) {
      const saved = saveDataUrlAttachment(attachment);
      if (saved) {
        input.push(saved.input);
        savedImages.push(saved.preview);
      }
    }
    const params = {
      threadId: this.threadId,
      input,
    };
    if (options.model) params.model = options.model;
    if (options.approvalPolicy) params.approvalPolicy = options.approvalPolicy;
    if (options.sandboxMode) params.sandboxPolicy = sandboxPolicyForMode(options.sandboxMode);
    const id = this.request("turn/start", {
      ...params,
    });
    if (!id) return;
    this.pending.set(id, "turn/start");
    this.setBridgeRunState("running", "Codex 処理中");
    const displayText = savedImages.length ? `${text}\n\n添付: ${savedImages.map((image) => image.name).join(", ")}` : text;
    this.appendHistory({ type: "user", text: displayText, attachments: savedImages });
    this.emit("user", { text: displayText, attachments: savedImages });
  }

  appendHistory(entry) {
    this.history.push(entry);
    this.history = capHistory(this.history);
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
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
      this.markUpstreamClosed();
      return;
    }
    this.upstream.send(JSON.stringify({ id: requestMsg.id, result }));
    this.emit("status", { text: accept ? "承認しました" : "拒否しました" });
  }
}

function getBridge(threadId, connectionId = crypto.randomUUID()) {
  if (!threadId) {
    for (const bridge of bridges.values()) {
      if (!bridge.requestedThreadId) return bridge;
    }
  }
  const key = bridgeKeyForRequest(threadId, connectionId);
  if (!bridges.has(key)) bridges.set(key, new SharedBridge(threadId, key));
  return bridges.get(key);
}

function bindBrowser(browser, phoneToken, threadId) {
  const bridge = getBridge(threadId);
  bridge.addClient(browser);

  browser.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (tokenRequired && msg.token !== phoneToken) {
      bridge.emitTo(browser, "error", { text: "Invalid token" });
      browser.close();
      return;
    }
    if (msg.type === "prompt") bridge.prompt(msg.text, msg.attachments, msg.options);
    if (msg.type === "interrupt") bridge.interrupt();
    if (msg.type === "approval") bridge.approval(msg.request, msg.decision);
  });
}

async function main() {
  const phoneToken = tokenRequired ? getToken() : "";
  const codex = shouldStartCodexServer ? startCodexServer() : null;
  if (shouldStartCodexServer) {
    await waitForReady();
  } else {
    await appServerRequest("thread/loaded/list", { cursor: null, limit: 1 });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/info") {
      sendJson(res, 200, {
        model,
        workdir,
        codexUrl,
        codexSocketPath: codexSocketPath || null,
        managedCodexServer: shouldStartCodexServer,
        tokenRequired,
        authMode,
      });
      return;
    }
    if (url.pathname === "/api/threads") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("thread/list", {
          limit: 30,
          sortKey: "updated_at",
          sortDirection: "desc",
          archived: false,
          useStateDbOnly: false,
        });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/models") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("model/list", { limit: 80, includeHidden: false });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/plugins") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("plugin/list", { cwds: [workdir] });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/config") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const [config, auth] = await Promise.allSettled([
          appServerRequest("config/read", { includeLayers: false, cwd: workdir }),
          appServerRequest("getAuthStatus", {}),
        ]);
        sendJson(res, 200, {
          config: config.status === "fulfilled" ? config.value : null,
          auth: auth.status === "fulfilled" ? auth.value : null,
          errors: [config, auth]
            .filter((result) => result.status === "rejected")
            .map((result) => result.reason.message),
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/status") {
      if (!requireToken(url, phoneToken, res)) return;
      sendJson(res, 200, {
        workdir,
        model,
        codexUrl,
        codexSocketPath: codexSocketPath || null,
        managedCodexServer: shouldStartCodexServer,
        historySyncEnabled,
        tokenRequired,
        authMode,
        uiPort,
        codexPort,
        bridges: Array.from(bridges.values()).map((bridge) => ({
          threadId: bridge.threadId,
          clients: bridge.clients.size,
          ready: bridge.ready,
        })),
      });
      return;
    }
    if (url.pathname === "/api/history-sync") {
      if (!requireToken(url, phoneToken, res)) return;
      const threadId = url.searchParams.get("thread");
      if (!threadId) {
        sendJson(res, 400, { error: "thread is required" });
        return;
      }
      try {
        const result = await runHistorySync({
          threadId,
          workdir,
          request: appServerRequest,
          enabled: historySyncEnabled,
        });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/thread") {
      if (!requireToken(url, phoneToken, res)) return;
      const threadId = url.searchParams.get("thread");
      if (!threadId) {
        sendJson(res, 400, { error: "thread is required" });
        return;
      }
      try {
        const snapshot = await readThreadSnapshot({
          threadId,
          liveBridge: findLiveBridge(bridges, threadId),
          request: appServerRequest,
          model,
          workdir,
          historyFromThread,
        });
        sendJson(res, 200, snapshot);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/automations") {
      if (!requireToken(url, phoneToken, res)) return;
      sendJson(res, 200, { data: readAutomations() });
      return;
    }
    if (url.pathname === "/api/artifacts") {
      if (!requireToken(url, phoneToken, res)) return;
      sendJson(res, 200, { data: discoverArtifacts() });
      return;
    }
    if (url.pathname === "/api/workspace") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        sendJson(res, 200, {
          data: await discoverWorkspaceEntries({
            limit: Number(url.searchParams.get("limit") || 200),
            query: url.searchParams.get("q") || "",
          }),
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/review") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        sendJson(res, 200, await reviewSummary());
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/uploaded") {
      if (!requireToken(url, phoneToken, res)) return;
      const target = safeUploadPath(url.searchParams.get("name"));
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile() || !isImagePath(target)) {
        sendJson(res, 404, { error: "image not found" });
        return;
      }
      res.writeHead(200, { "content-type": mimeForPath(target), "cache-control": "no-store" });
      fs.createReadStream(target).pipe(res);
      return;
    }
    if (url.pathname === "/api/file/raw") {
      if (!requireToken(url, phoneToken, res)) return;
      const target = safeOpenPath(url.searchParams.get("path"));
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile() || !isImagePath(target)) {
        sendJson(res, 404, { error: "image not found" });
        return;
      }
      res.writeHead(200, { "content-type": mimeForPath(target), "cache-control": "no-store" });
      fs.createReadStream(target).pipe(res);
      return;
    }
    if (url.pathname === "/api/file") {
      if (!requireToken(url, phoneToken, res)) return;
      const target = safeOpenPath(url.searchParams.get("path"));
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        sendJson(res, 404, { error: "file not found" });
        return;
      }
      if (isImagePath(target)) {
        sendJson(res, 200, {
          path: relativeDisplayPath(target),
          kind: "image",
          mimeType: mimeForPath(target),
          imageUrl: `/api/file/raw?path=${encodeURIComponent(relativeDisplayPath(target))}`,
        });
        return;
      }
      sendJson(res, 200, {
        path: relativeDisplayPath(target),
        kind: /\.md(?:own)?$/i.test(target) ? "markdown" : "text",
        text: fs.readFileSync(target, "utf8").slice(0, 80_000),
      });
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
    if (tokenRequired && url.searchParams.get("token") !== phoneToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const threadId = url.searchParams.get("thread") || null;
    wss.handleUpgrade(req, socket, head, (ws) => bindBrowser(ws, phoneToken, threadId));
  });

  server.listen(uiPort, listenHost, () => {
    const addresses = tokenRequired || debugLan ? lanAddresses() : ["127.0.0.1"];
    const urls = bridgeUrls(addresses, uiPort, phoneToken);
    console.log("");
    console.log("Codex shared browser bridge is ready.");
    for (const url of urls) console.log(`  ${url}`);
    console.log("");
    console.log(`Auth:    ${tokenRequired ? "token" : debugLan ? "debug-no-token (LAN exposed)" : "debug-no-token (localhost only)"}`);
    console.log(`Listen:  ${listenHost}:${uiPort}`);
    console.log(`Workdir: ${workdir}`);
    console.log(`Model:   ${model}`);
    console.log(`Codex:   ${shouldStartCodexServer ? codexUrl : codexSocketPath || codexUrl}`);
    if (tokenRequired) console.log("Open the same URL from PC and phone to share one bridge thread.");
    else if (debugLan) console.log("Tokenless debug LAN mode is exposed to this network. Use only on a trusted LAN.");
    else console.log("Open the URL on this Mac only; tokenless debug mode is not exposed to the LAN.");
    console.log("Press Ctrl+C to stop.");

    if (!tokenRequired) {
      console.log("[notify] skipped in debug-no-token mode");
      return;
    }

    notifyBridgeUrls(urls).then((results) => {
      for (const result of results) {
        if (result.ok) console.log(`[notify] sent via ${result.type}`);
        else console.warn(`[notify] ${result.type} failed: ${result.error}`);
      }
    });
  });

  process.on("exit", () => {
    if (codex) codex.kill("SIGINT");
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  module.exports = {
    decorateReviewFiles,
    discoverWorkspaceEntries,
    relativeDisplayPath,
    reviewSummary,
    runGit,
    safeOpenPath,
    safePathWithin,
    safeRelativePath,
    safeWorkdirPath,
  };
}
