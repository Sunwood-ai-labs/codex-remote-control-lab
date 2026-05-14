const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const {
  appServerArgs,
} = require("./codex-app-server-config");
const {
  bridgeKeyForRequest,
  retentionConfigFromEnv,
  shouldDisposeIdleBridge,
  shouldScheduleIdleCleanup,
  shouldPromoteBridgeKey,
} = require("./bridge-state");
const { isHistorySyncEnabled, runHistorySync } = require("./history-sync");
const { bridgeUrls, notifyBridgeUrls } = require("./phone-notify");
const { isSessionBusy, mergeSessionState, normalizeHookState } = require("./session-state");
const { findLiveBridge, liveThreadSummaries, readThreadSnapshot } = require("./thread-read");

let pty = null;
try {
  pty = require("node-pty");
} catch {
  pty = null;
}

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
const codexTerminalBin = process.env.CODEX_TERMINAL_BIN || (fs.existsSync(codexBin) ? codexBin : "codex");
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
const terminalSessions = new Map();
const sessionStates = new Map();
const retainedSessionConfig = retentionConfigFromEnv(process.env);
const maxSessionStates = Math.max(20, retainedSessionConfig.maxSessions * 4);
const terminalOutputFlushMs = 16;
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

function createIdleRetentionTimer(callback) {
  const timer = setTimeout(callback, retainedSessionConfig.idleTtlMs);
  timer.unref?.();
  return timer;
}

function pruneIdleRetainedSessions(collection, dispose) {
  if (collection.size <= retainedSessionConfig.maxSessions) return;
  const idleItems = Array.from(collection.values())
    .filter((item) => !item.clients?.size)
    .sort((a, b) => (a.lastAccessAt || a.updatedAt || a.createdAt || 0) - (b.lastAccessAt || b.updatedAt || b.createdAt || 0));
  while (collection.size > retainedSessionConfig.maxSessions && idleItems.length) {
    dispose(idleItems.shift());
  }
}

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

function remoteHookUrl() {
  return `http://127.0.0.1:${uiPort}/api/codex-hook`;
}

function remoteHookEnv(phoneToken) {
  return {
    CODEX_REMOTE_HOOK_URL: remoteHookUrl(),
    CODEX_REMOTE_HOOK_TOKEN: phoneToken || "",
  };
}

function stateKeyForSession(sessionId, cwd = "") {
  if (sessionId) return `session:${sessionId}`;
  return `cwd:${path.resolve(cwd || workdir)}`;
}

function sessionStateFor(threadId, cwd = "") {
  const direct = sessionStates.get(stateKeyForSession(threadId, cwd));
  if (direct) return direct;
  if (!cwd) return null;
  return sessionStates.get(stateKeyForSession("", cwd)) || null;
}

function sessionStateMatches(state, threadId, cwd = "") {
  if (!state) return false;
  if (threadId && state.sessionId && state.sessionId === threadId) return true;
  if (cwd && state.cwd && path.resolve(state.cwd) === path.resolve(cwd)) return true;
  return false;
}

function broadcastSessionState(state) {
  for (const bridge of bridges.values()) {
    if (!sessionStateMatches(state, bridge.threadId || bridge.requestedThreadId, bridge.cwd)) continue;
    bridge.noteActivity?.();
    bridge.emit("sessionState", { state });
  }
  for (const session of terminalSessions.values()) {
    if (!sessionStateMatches(state, session.threadId, session.cwd)) continue;
    session.noteActivity?.();
    session.broadcast({ type: "sessionState", state });
  }
}

function updateSessionState(statePatch) {
  const key = stateKeyForSession(statePatch.sessionId, statePatch.cwd);
  const previous = sessionStates.get(key);
  const state = mergeSessionState(previous, statePatch);
  sessionStates.set(key, state);
  if (state.cwd) sessionStates.set(stateKeyForSession("", state.cwd), state);
  pruneSessionStates();
  broadcastSessionState(state);
  if (!isSessionBusy(state)) {
    for (const bridge of bridges.values()) {
      if (sessionStateMatches(state, bridge.threadId || bridge.requestedThreadId, bridge.cwd)) bridge.startNextQueuedTurn?.();
    }
  }
  return state;
}

function pruneSessionStates() {
  if (sessionStates.size <= maxSessionStates) return;
  const entries = Array.from(sessionStates.entries()).sort((left, right) => {
    return Number(left[1]?.updatedAt || 0) - Number(right[1]?.updatedAt || 0);
  });
  while (sessionStates.size > maxSessionStates && entries.length) {
    const [key] = entries.shift();
    sessionStates.delete(key);
  }
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

function startCodexServer(phoneToken = "") {
  const child = spawn(codexBin, appServerArgs(codexUrl), {
    cwd: root,
    env: {
      ...process.env,
      ...remoteHookEnv(phoneToken),
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

function readJsonBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
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

function safeDirectoryPath(input, base = os.homedir()) {
  const raw = String(input || base);
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(raw);
  try {
    const realBase = fs.realpathSync(resolvedBase);
    const realTarget = fs.realpathSync(resolved);
    const stat = fs.statSync(realTarget);
    if (!stat.isDirectory()) return null;
    if (realTarget !== realBase && !realTarget.startsWith(`${realBase}${path.sep}`)) return null;
    return {
      absolute: realTarget,
      name: path.basename(realTarget) || realTarget,
      parent: realTarget === realBase ? null : path.dirname(realTarget),
    };
  } catch {
    return null;
  }
}

function safeSessionCwdPath(input) {
  if (!input) return null;
  return safeDirectoryPath(input, workdir) || safeDirectoryPath(input, os.homedir());
}

function readDirectoryListing(input, showHidden = false, base = os.homedir()) {
  const directory = safeDirectoryPath(input || base, base);
  if (!directory) return null;
  let children;
  try {
    children = fs.readdirSync(directory.absolute, { withFileTypes: true });
  } catch {
    children = [];
  }
  const entries = children
    .filter((entry) => entry.isDirectory())
    .filter((entry) => showHidden || !entry.name.startsWith("."))
    .map((entry) => ({ name: entry.name, path: path.join(directory.absolute, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    root: safeDirectoryPath(base, base)?.absolute || path.resolve(base),
    path: directory.absolute,
    name: directory.name,
    parent: directory.parent,
    entries,
  };
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

function firstMarkdownHeading(markdown) {
  return String(markdown || "").match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
}

function skillDescription(markdown) {
  const frontmatter = String(markdown || "").match(/^---\n([\s\S]*?)\n---/);
  const frontmatterDescription = frontmatter?.[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (frontmatterDescription) return frontmatterDescription.replace(/^["']|["']$/g, "");
  return firstMarkdownHeading(markdown);
}

function readSkillsFrom(rootDir, source) {
  if (!fs.existsSync(rootDir)) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillFile = path.join(rootDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) return null;
      const raw = fs.readFileSync(skillFile, "utf8");
      return {
        name: entry.name,
        description: skillDescription(raw),
        source,
      };
    })
    .filter(Boolean);
}

function readSkills(options = {}) {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const codexSkillsDir = Object.prototype.hasOwnProperty.call(options, "codexSkillsDir") ? options.codexSkillsDir : path.join(codexHome, "skills");
  const agentSkillsDir = Object.prototype.hasOwnProperty.call(options, "agentSkillsDir")
    ? options.agentSkillsDir
    : path.join(os.homedir(), ".agents", "skills");
  const roots = [
    { path: codexSkillsDir, source: "codex" },
    { path: agentSkillsDir, source: "agents" },
  ].filter((rootInfo) => rootInfo.path);
  const seen = new Set();
  const skills = [];
  for (const rootInfo of roots) {
    for (const skill of readSkillsFrom(rootInfo.path, rootInfo.source)) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      skills.push(skill);
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
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

function sandboxPolicyForMode(mode, cwd = workdir) {
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  if (mode === "read-only") return { type: "readOnly", networkAccess: true };
  return {
    type: "workspaceWrite",
    writableRoots: [cwd],
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
  constructor(requestedThreadId, bridgeKey, options = {}) {
    this.requestedThreadId = requestedThreadId;
    this.bridgeKey = bridgeKey;
    this.cwd = options.cwd || workdir;
    this.clients = new Set();
    this.nextId = 1;
    this.pending = new Map();
    this.threadId = null;
    this.activeTurnId = null;
    this.ready = false;
    this.startupFailed = false;
    this.materialized = Boolean(this.requestedThreadId);
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lastAccessAt = this.createdAt;
    this.idleDeadlineAt = 0;
    this.cleanupTimer = null;
    this.history = [];
    this.turnQueue = [];
    this.upstream = createUpstreamWebSocket();
    this.bindUpstream();
  }

  addClient(browser) {
    this.cancelIdleCleanup();
    this.touchAccess();
    this.clients.add(browser);
    this.emitTo(browser, "status", { text: "共有Codexブリッジに参加しました。" });
    if (this.ready) {
      this.emitTo(browser, "ready", this.readyPayload());
    }
    browser.on("close", () => {
      this.clients.delete(browser);
      if (shouldScheduleIdleCleanup({ clientCount: this.clients.size })) {
        this.scheduleIdleCleanup();
        pruneIdleRetainedSessions(bridges, (bridge) => bridge.dispose());
      }
    });
  }

  touchAccess() {
    const now = Date.now();
    this.lastAccessAt = now;
    this.updatedAt = now;
  }

  cancelIdleCleanup() {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
    this.idleDeadlineAt = 0;
  }

  scheduleIdleCleanup() {
    this.cancelIdleCleanup();
    this.idleDeadlineAt = Date.now() + retainedSessionConfig.idleTtlMs;
    this.cleanupTimer = createIdleRetentionTimer(() => this.disposeIfIdle());
  }

  noteActivity() {
    this.touchAccess();
    if (!this.clients.size) this.scheduleIdleCleanup();
  }

  disposeIfIdle() {
    if (!shouldDisposeIdleBridge({ clientCount: this.clients.size, idleDeadlineAt: this.idleDeadlineAt })) return;
    this.dispose();
  }

  dispose() {
    this.cancelIdleCleanup();
    try {
      this.upstream.close();
    } catch {}
    bridges.delete(this.bridgeKey);
  }

  readyPayload() {
    return {
      threadId: this.threadId,
      model,
      workdir: this.cwd,
      shared: true,
      clients: this.clients.size,
      history: this.history,
      materialized: this.materialized,
      sessionState: sessionStateFor(this.threadId, this.cwd),
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
    this.touchAccess();
    const id = this.nextId++;
    this.upstream.send(JSON.stringify({ id, method, params }));
    return id;
  }

  hasPendingTurnStart() {
    return Array.from(this.pending.values()).includes("turn/start");
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
            cwd: this.cwd,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          }
        : {
            model,
            cwd: this.cwd,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          };
      const id = this.request(method, params);
      this.pending.set(id, method);
      this.emit("status", { text: this.requestedThreadId ? "既存threadを再開中..." : "新しいthreadを開始中..." });
    });

    this.upstream.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.noteActivity();
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
        this.touchAccess();
        this.history = historyFromThread(msg.result.thread);
        this.materialized = this.materialized || this.history.length > 0;
        this.emit("ready", this.readyPayload());
        if (this.requestedThreadId) this.emit("status", { text: `既存threadを再開しました: ${this.threadId}` });
        return;
      }

      if (pendingMethod === "turn/start") {
        this.pending.delete(msg.id);
        if (msg.error) {
          this.emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
          this.startNextQueuedTurn();
        } else {
          this.activeTurnId = msg.result.turn.id;
          this.updatedAt = Date.now();
          updateSessionState({
            source: "app-server",
            status: "running",
            label: "Codex 処理中",
            busy: true,
            completed: false,
            sessionId: this.threadId,
            turnId: this.activeTurnId,
            cwd: this.cwd,
            event: "turn/start",
            updatedAt: Date.now(),
          });
          this.emit("turn", { status: "started", turnId: this.activeTurnId });
        }
        return;
      }

      if (msg.method === "item/agentMessage/delta") {
        this.emit("assistantDelta", { text: msg.params.delta });
        return;
      }

      if (msg.method === "item/started") {
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
        this.activeTurnId = null;
        this.updatedAt = Date.now();
        this.materialized = true;
        updateSessionState({
          source: "app-server",
          status: "input_ready",
          label: "入力待ち",
          busy: false,
          completed: true,
          sessionId: this.threadId,
          turnId: msg.params.turnId,
          cwd: this.cwd,
          event: "turn/completed",
          updatedAt: Date.now(),
        });
        this.emit("turn", { status: "completed", turnId: msg.params.turnId });
        this.syncHistory("turn completed");
        this.startNextQueuedTurn();
        return;
      }

      if (msg.method && msg.method.endsWith("/requestApproval")) {
        updateSessionState({
          source: "app-server",
          status: "awaiting_approval",
          label: "承認待ち",
          busy: true,
          completed: false,
          sessionId: this.threadId,
          turnId: this.activeTurnId,
          cwd: this.cwd,
          event: msg.method,
          updatedAt: Date.now(),
        });
        this.emit("approval", { request: msg });
        return;
      }

      if (msg.method === "error") {
        this.emit("error", { text: msg.params.message || JSON.stringify(msg.params) });
        return;
      }

      this.emit("event", { event: msg });
    });

    this.upstream.on("error", (error) => {
      if (!this.ready) this.startupFailed = true;
      this.emit("error", { text: error.message });
    });
    this.upstream.on("close", () => {
      if (!this.ready) this.startupFailed = true;
      this.emit("status", { text: "Codex接続が閉じました" });
    });
  }

  prompt(text, attachments = [], options = {}) {
    this.touchAccess();
    if (!this.threadId) {
      this.emit("error", { text: "Thread is not ready yet" });
      return;
    }
    if (this.activeTurnId || this.hasPendingTurnStart() || isSessionBusy(sessionStateFor(this.threadId, this.cwd))) {
      this.turnQueue.push({ text, attachments, options });
      this.emit("status", { text: `キューに追加しました（${this.turnQueue.length}件待機）` });
      return;
    }
    this.startPrompt(text, attachments, options);
  }

  startNextQueuedTurn() {
    if (
      !this.ready ||
      this.activeTurnId ||
      this.hasPendingTurnStart() ||
      isSessionBusy(sessionStateFor(this.threadId, this.cwd)) ||
      !this.turnQueue.length
    ) {
      return;
    }
    const next = this.turnQueue.shift();
    this.emit("status", { text: `キューから送信中（残り${this.turnQueue.length}件）` });
    this.startPrompt(next.text, next.attachments, next.options);
  }

  syncHistory(reason) {
    if (!this.threadId || !historySyncEnabled) return;
    runHistorySync({
      threadId: this.threadId,
      workdir: this.cwd,
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
    if (options.sandboxMode) params.sandboxPolicy = sandboxPolicyForMode(options.sandboxMode, this.cwd);
    const id = this.request("turn/start", {
      ...params,
    });
    this.pending.set(id, "turn/start");
    const displayText = savedImages.length ? `${text}\n\n添付: ${savedImages.map((image) => image.name).join(", ")}` : text;
    this.appendHistory({ type: "user", text: displayText, attachments: savedImages });
    this.emit("user", { text: displayText, attachments: savedImages });
  }

  appendHistory(entry) {
    this.history.push(entry);
    this.touchAccess();
    this.history = capHistory(this.history);
  }

  approval(requestMsg, decision) {
    this.touchAccess();
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

function getBridge(threadId, connectionId = crypto.randomUUID(), options = {}) {
  if (!threadId && !options.forceNew) {
    for (const bridge of bridges.values()) {
      if (!bridge.requestedThreadId) return bridge;
    }
  }
  const key = options.forceNew && !threadId ? `new:${connectionId}` : bridgeKeyForRequest(threadId, connectionId);
  if (!bridges.has(key)) bridges.set(key, new SharedBridge(threadId, key, { cwd: options.cwd || workdir }));
  pruneIdleRetainedSessions(bridges, (bridge) => bridge.dispose());
  return bridges.get(key);
}

function bindBrowser(browser, phoneToken, threadId, options = {}) {
  const bridge = getBridge(threadId, crypto.randomUUID(), options);
  bridge.addClient(browser);

  browser.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (tokenRequired && msg.token !== phoneToken) {
      bridge.emitTo(browser, "error", { text: "Invalid token" });
      browser.close();
      return;
    }
    if (msg.type === "prompt") bridge.prompt(msg.text, msg.attachments, msg.options);
    if (msg.type === "approval") bridge.approval(msg.request, msg.decision);
  });
}

function terminalKeyFor(threadId, cwd) {
  return `${threadId || "new"}:${path.resolve(cwd || workdir)}`;
}

function terminalCodexArgs(threadId, cwd) {
  const args = ["resume"];
  if (!codexSocketPath && codexUrl) args.push("--remote", codexUrl);
  args.push("-C", cwd);
  args.push(threadId);
  return args;
}

function isTerminalInterruptInput(data) {
  const text = String(data || "");
  return text === "\u001b" || text.includes("\u0003");
}

class TerminalPtySession {
  constructor({ threadId, cwd, cols, rows }) {
    this.threadId = threadId;
    this.cwd = cwd || workdir;
    this.clients = new Set();
    this.buffer = "";
    this.closed = false;
    this.cleanupTimer = null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lastAccessAt = this.createdAt;
    this.idleDeadlineAt = 0;
    this.outputQueue = "";
    this.outputFlushTimer = null;
    this.proc = this.spawn(cols, rows);
  }

  spawn(cols = 100, rows = 30) {
    if (!pty) throw new Error("node-pty is not available. Run npm install before using terminal mode.");
    if (!this.threadId) throw new Error("thread is required for Codex terminal resume");
    const executable = codexTerminalBin;
    const args = terminalCodexArgs(this.threadId, this.cwd);
    const proc = pty.spawn(executable, args, {
      cwd: this.cwd,
      cols: Math.max(20, Number(cols) || 100),
      rows: Math.max(8, Number(rows) || 30),
      env: {
        ...process.env,
        ...remoteHookEnv(process.env.CODEX_REMOTE_HOOK_TOKEN || ""),
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
      name: "xterm-256color",
    });
    proc.onData((data) => this.enqueueOutput(data));
    proc.onExit(({ exitCode, signal }) => {
      this.flushOutput();
      this.closed = true;
      this.broadcast({ type: "exit", code: exitCode, signal });
      terminalSessions.delete(terminalKeyFor(this.threadId, this.cwd));
    });
    return proc;
  }

  appendBuffer(data) {
    this.noteActivity();
    this.buffer += data;
    if (this.buffer.length > 240_000) this.buffer = this.buffer.slice(-200_000);
  }

  enqueueOutput(data) {
    this.appendBuffer(data);
    this.outputQueue += data;
    if (this.outputFlushTimer) return;
    this.outputFlushTimer = setTimeout(() => this.flushOutput(), terminalOutputFlushMs);
    this.outputFlushTimer.unref?.();
  }

  flushOutput() {
    if (this.outputFlushTimer) {
      clearTimeout(this.outputFlushTimer);
      this.outputFlushTimer = null;
    }
    if (!this.outputQueue) return;
    const data = this.outputQueue;
    this.outputQueue = "";
    this.broadcast({ type: "output", data });
  }

  addClient(ws) {
    this.cancelIdleCleanup();
    this.touchAccess();
    this.clients.add(ws);
    this.send(ws, { type: "status", text: "Codex CLI TUI に接続しました" });
    const state = sessionStateFor(this.threadId, this.cwd);
    if (state) this.send(ws, { type: "sessionState", state });
    if (this.buffer) this.send(ws, { type: "snapshot", data: this.buffer });
    ws.on("message", (data) => this.handleMessage(ws, data));
    ws.on("close", () => {
      this.clients.delete(ws);
      if (shouldScheduleIdleCleanup({ clientCount: this.clients.size })) {
        this.scheduleIdleCleanup();
        pruneIdleRetainedSessions(terminalSessions, (retained) => retained.terminate());
      }
    });
  }

  touchAccess() {
    const now = Date.now();
    this.lastAccessAt = now;
    this.updatedAt = now;
  }

  cancelIdleCleanup() {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
    this.idleDeadlineAt = 0;
  }

  scheduleIdleCleanup() {
    this.cancelIdleCleanup();
    this.idleDeadlineAt = Date.now() + retainedSessionConfig.idleTtlMs;
    this.cleanupTimer = createIdleRetentionTimer(() => this.disposeIfIdle());
  }

  noteActivity() {
    this.touchAccess();
    if (!this.clients.size) this.scheduleIdleCleanup();
  }

  disposeIfIdle() {
    if (!shouldDisposeIdleBridge({ clientCount: this.clients.size, idleDeadlineAt: this.idleDeadlineAt })) return;
    this.terminate();
  }

  handleMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this.send(ws, { type: "error", text: "invalid terminal message" });
      return;
    }
    this.touchAccess();
    if (msg.type === "input" && typeof msg.data === "string") {
      const state = sessionStateFor(this.threadId, this.cwd);
      const isInterrupt = isTerminalInterruptInput(msg.data);
      if (state?.status === "running" && !isInterrupt) {
        this.send(ws, { type: "status", text: "Codex 処理中のため、ターミナル入力を一時停止しています。" });
        return;
      }
      this.proc.write(msg.data);
      return;
    }
    if (msg.type === "resize") {
      const cols = Math.max(20, Number(msg.cols) || 100);
      const rows = Math.max(8, Number(msg.rows) || 30);
      try {
        this.proc.resize(cols, rows);
      } catch {}
      return;
    }
    if (msg.type === "terminate") {
      this.terminate();
    }
  }

  send(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  broadcast(payload) {
    for (const client of this.clients) this.send(client, payload);
  }

  terminate() {
    if (this.closed) return;
    this.closed = true;
    this.cancelIdleCleanup();
    this.flushOutput();
    try {
      this.proc.kill("SIGTERM");
    } catch {}
    terminalSessions.delete(terminalKeyFor(this.threadId, this.cwd));
  }
}

function getTerminalSession({ threadId, cwd, cols, rows }) {
  const key = terminalKeyFor(threadId, cwd);
  const existing = terminalSessions.get(key);
  if (existing && !existing.closed) return existing;
  const session = new TerminalPtySession({ threadId, cwd, cols, rows });
  terminalSessions.set(key, session);
  pruneIdleRetainedSessions(terminalSessions, (retained) => retained.terminate());
  return session;
}

function bindTerminalSocket(ws, { threadId, cwd, cols, rows }) {
  try {
    const bridge = findLiveBridge(bridges, threadId);
    if (bridge?.materialized === false && !process.env.CODEX_TERMINAL_BIN) {
      ws.send(JSON.stringify({ type: "error", text: "初回メッセージ後に Codex CLI TUI を開始します。" }));
      ws.close();
      return;
    }
    const session = getTerminalSession({ threadId, cwd, cols, rows });
    session.addClient(ws);
  } catch (error) {
    ws.send(JSON.stringify({ type: "error", text: error.message }));
    ws.close(1011, "terminal failed");
  }
}

async function main() {
  const phoneToken = tokenRequired ? getToken() : "";
  process.env.CODEX_REMOTE_HOOK_URL = remoteHookUrl();
  process.env.CODEX_REMOTE_HOOK_TOKEN = phoneToken;
  const codex = shouldStartCodexServer ? startCodexServer(phoneToken) : null;
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
    if (url.pathname === "/api/codex-hook") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      if (tokenRequired && req.headers["x-codex-remote-hook-token"] !== phoneToken) {
        sendJson(res, 401, { error: "invalid hook token" });
        return;
      }
      try {
        const payload = await readJsonBody(req);
        const state = updateSessionState(normalizeHookState(payload));
        sendJson(res, 200, { ok: true, state });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/threads") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("thread/list", {
          limit: 200,
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
    if (url.pathname === "/api/live-threads") {
      if (!requireToken(url, phoneToken, res)) return;
      sendJson(res, 200, {
        data: liveThreadSummaries(bridges, { sessionStateFor }),
      });
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
          workdir: bridge.cwd,
          clients: bridge.clients.size,
          ready: bridge.ready,
          materialized: bridge.materialized,
          sessionState: sessionStateFor(bridge.threadId, bridge.cwd),
        })),
        sessionStates: Array.from(sessionStates.values()),
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
          refreshLiveBridge: true,
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
    if (url.pathname === "/api/skills") {
      if (!requireToken(url, phoneToken, res)) return;
      sendJson(res, 200, { data: readSkills() });
      return;
    }
    if (url.pathname === "/api/fs/root") {
      if (!requireToken(url, phoneToken, res)) return;
      const home = safeDirectoryPath(os.homedir(), os.homedir());
      sendJson(res, 200, { root: home?.absolute || os.homedir() });
      return;
    }
    if (url.pathname === "/api/fs/list") {
      if (!requireToken(url, phoneToken, res)) return;
      const listing = readDirectoryListing(url.searchParams.get("path"), url.searchParams.get("hidden") === "1", os.homedir());
      if (!listing) {
        sendJson(res, 404, { error: "directory not found or outside home" });
        return;
      }
      sendJson(res, 200, listing);
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
    if (url.pathname !== "/bridge" && url.pathname !== "/terminal") {
      socket.destroy();
      return;
    }
    if (tokenRequired && url.searchParams.get("token") !== phoneToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const threadId = url.searchParams.get("thread") || null;
    const requestedCwd = url.searchParams.get("cwd");
    const safeCwd = requestedCwd ? safeSessionCwdPath(requestedCwd) : null;
    if (requestedCwd && !safeCwd) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    if (url.pathname === "/terminal" && !threadId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (url.pathname === "/terminal") {
        bindTerminalSocket(ws, {
          threadId,
          cwd: safeCwd?.absolute || workdir,
          cols: Number(url.searchParams.get("cols") || 100),
          rows: Number(url.searchParams.get("rows") || 30),
        });
        return;
      }
      bindBrowser(ws, phoneToken, threadId, { forceNew: url.searchParams.get("new") === "1", cwd: safeCwd?.absolute });
    });
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

  const cleanup = () => {
    if (codex) codex.kill("SIGINT");
    for (const session of terminalSessions.values()) session.terminate();
  };
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    cleanup();
    process.exit();
  };
  process.on("exit", cleanup);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
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
    readDirectoryListing,
    readSkills,
    reviewSummary,
    runGit,
    safeDirectoryPath,
    safeOpenPath,
    safePathWithin,
    safeRelativePath,
    safeSessionCwdPath,
    safeWorkdirPath,
    normalizeHookState,
  };
}
