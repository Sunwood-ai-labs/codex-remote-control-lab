const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const WebSocket = require("ws");
const { approvalRecordForClient, approvalResultForDecision, createApprovalStore, isApprovalRequest } = require("./approval-store");
const { bridgeKeyForRequest, shouldDisposeIdleBridge, shouldPromoteBridgeKey } = require("./bridge-state");
const { isHistorySyncEnabled, runHistorySync } = require("./history-sync");
const { bridgeUrls, notifyBridgeUrls, notifyTaskEvent } = require("./phone-notify");
const { findLiveBridge, liveThreadSummaries, readThreadSnapshot } = require("./thread-read");

const root = path.resolve(__dirname, "..");

function displayPath(targetPath) {
  const home = os.homedir();
  const relative = path.relative(home, targetPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return `~/${relative}`;
  if (!relative) return "~";
  return targetPath;
}

function gitOutput(args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: workdir, encoding: "utf8", timeout: 1500 }, (error, stdout) => {
      resolve(error ? "" : stdout.trim());
    });
  });
}

function normalizeProvider(input) {
  const value = String(input || "codex").trim().toLowerCase();
  if (value === "codex" || value === "claude") return value;
  throw new Error(`Unsupported PHONE_AGENT_PROVIDER: ${value}`);
}

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

const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const codexBin = path.join(root, "node_modules", ".bin", "codex");
const claudeBin = process.env.CLAUDE_BIN || "claude";
const claudeProjectsRoot = path.join(os.homedir(), ".claude", "projects");
const uiPort = Number(process.env.PHONE_UI_PORT || 45214);
const codexPort = Number(process.env.CODEX_APP_SERVER_PORT || 45213);
const codexSocketPath = process.env.CODEX_APP_SERVER_SOCK || "";
const codexUrl = process.env.CODEX_APP_SERVER_URL || (codexSocketPath ? "ws://codex-app-server/rpc" : `ws://127.0.0.1:${codexPort}`);
const agentProvider = normalizeProvider(process.env.PHONE_AGENT_PROVIDER || process.env.AGENT_PROVIDER || process.env.PHONE_AGENT_PROVIDER_DEFAULT || "codex");
const isCodexProvider = agentProvider === "codex";
const isClaudeProvider = agentProvider === "claude";
const shouldStartCodexServer = isCodexProvider && !process.env.CODEX_APP_SERVER_URL && !codexSocketPath;
const workdirEnvKey = isClaudeProvider ? "CLAUDE_WORKDIR" : "CODEX_WORKDIR";
const modelEnvKey = isClaudeProvider ? "CLAUDE_MODEL" : "CODEX_MODEL";
const workdir = path.resolve(process.env.PHONE_WORKDIR || process.env[workdirEnvKey] || process.env.CODEX_WORKDIR || root);
const model = process.env.PHONE_MODEL || process.env[modelEnvKey] || (isClaudeProvider ? "sonnet" : "gpt-5.4");
const historySyncEnabled = isCodexProvider && isHistorySyncEnabled(process.env);
const debugNoToken = /^(1|true|yes|on)$/i.test(process.env.PHONE_DEBUG_NO_TOKEN || "");
const debugBind = (process.env.PHONE_DEBUG_BIND || "").trim().toLowerCase();
const debugLan = debugNoToken && debugBind === "lan";
const authMode = debugNoToken ? "debug-no-token" : "token";
const tokenRequired = authMode === "token";
const listenHost = tokenRequired || debugLan ? "0.0.0.0" : "127.0.0.1";
const tokenPath = path.join(root, ".phone-token");
const lastThreadPath = path.join(root, ".phone-thread");
const lastThreadCwdPath = path.join(root, ".phone-thread-cwd");
const rateLimitCacheTtlMs = positiveNumber(process.env.PHONE_RATE_LIMIT_CACHE_TTL_MS, 5 * 60 * 1000);
const rateLimitRefreshTimeoutMs = positiveNumber(process.env.PHONE_RATE_LIMIT_REFRESH_TIMEOUT_MS, 6000);
const uploadDir = path.join(root, ".uploads");
const bridges = new Map();
const approvalStore = createApprovalStore();
let notificationBridgeUrls = [];
const historyLimit = 80;
const modelOptions = isClaudeProvider
  ? ["sonnet", "opus", "haiku", "claude-sonnet-4-6", "claude-opus-4-5"]
  : ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2"];
const imageExtensions = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

let workspaceMetaCache = {
  repoName: path.basename(workdir),
  workspaceLocation: displayPath(workdir),
  gitBranch: "不明",
};

function currentWorkspaceMeta() {
  return workspaceMetaCache;
}

async function refreshWorkspaceMeta() {
  const gitRoot = await gitOutput(["rev-parse", "--show-toplevel"]);
  const repoRoot = gitRoot || workdir;
  const branch = (await gitOutput(["branch", "--show-current"])) || (await gitOutput(["rev-parse", "--short", "HEAD"]));
  const location = gitRoot ? path.relative(gitRoot, workdir) || "." : displayPath(workdir);
  workspaceMetaCache = {
    repoName: path.basename(repoRoot),
    workspaceLocation: location,
    gitBranch: branch || "不明",
  };
  return workspaceMetaCache;
}

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

function readLastThreadId(filePath = lastThreadPath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function writeLastThreadId(threadId, filePath = lastThreadPath) {
  if (!threadId) return;
  fs.writeFileSync(filePath, `${threadId}\n`, { mode: 0o600 });
}

function readLastThreadCwd(filePath = lastThreadCwdPath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function writeLastThreadCwd(cwd, filePath = lastThreadCwdPath) {
  if (!cwd) return;
  fs.writeFileSync(filePath, `${cwd}\n`, { mode: 0o600 });
}

function clearLastThreadId(threadId, paths = {}) {
  const threadPath = paths.threadPath || lastThreadPath;
  const cwdPath = paths.cwdPath || lastThreadCwdPath;
  try {
    if (!threadId || readLastThreadId(threadPath) !== threadId) return;
    if (fs.existsSync(threadPath)) fs.unlinkSync(threadPath);
    if (fs.existsSync(cwdPath)) fs.unlinkSync(cwdPath);
  } catch {
    // Saved thread state is a reconnect hint; bridge startup should continue if cleanup fails.
  }
}

function isMissingThreadError(message) {
  return /no rollout found for thread id|thread not found|thread id not found|no thread found/i.test(String(message || ""));
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && (entry.family === "IPv4" || entry.family === 4) && !entry.internal)
    .map((entry) => entry.address);
}

function preferredBridgeUrl(urls = notificationBridgeUrls) {
  return (
    urls.find((item) => {
      try {
        return new URL(item).hostname.startsWith("100.");
      } catch {
        return false;
      }
    }) ||
    (urls.length === 1 ? urls[0] : "") ||
    ""
  );
}

function bridgeUrlsForThread(threadId) {
  return notificationBridgeUrls.map((base) => {
    try {
      const url = new URL(base);
      if (threadId) url.searchParams.set("thread", threadId);
      return url.toString();
    } catch {
      return base;
    }
  });
}

function bridgeUrlForThread(threadId) {
  const urls = bridgeUrlsForThread(threadId);
  return preferredBridgeUrl(urls);
}

function notifyRunEvent(status, { threadId, turnId, message } = {}) {
  const urls = bridgeUrlsForThread(threadId);
  notifyTaskEvent({
    status,
    provider: "Codex",
    threadId,
    turnId,
    model,
    workdir,
    message,
    url: preferredBridgeUrl(urls),
    urls,
  })
    .then((results) => logNotifyResults(`task ${status}`, results))
    .catch((error) => console.warn(`[notify] task ${status} error: ${error.message}`));
}

function logNotifyResults(context, results) {
  if (!results.length) return;
  for (const result of results) {
    if (result.ok) console.log(`[notify] ${context} sent via ${result.type}`);
    else console.warn(`[notify] ${context} ${result.type} failed: ${result.error}`);
  }
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

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sanitizeRateLimitWindow(item) {
  const label = String(item?.label || item?.window || item?.name || "").trim();
  const resetsAt = String(item?.resetsAt || item?.resetAt || item?.reset || "").trim();
  const remainingPercent = Number(item?.remainingPercent ?? item?.remaining ?? item?.percent);
  if (!label && !resetsAt && !Number.isFinite(remainingPercent)) return null;
  return {
    label: label || "制限",
    remainingPercent: Number.isFinite(remainingPercent) ? Math.max(0, Math.min(100, Math.round(remainingPercent))) : null,
    resetsAt,
  };
}

function normalizeRateLimitSnapshot(payload, fallbackSource = "unknown", provider = "codex") {
  const rawWindows = Array.isArray(payload) ? payload : payload?.windows || payload?.limits || [];
  const windows = (Array.isArray(rawWindows) ? rawWindows : []).map(sanitizeRateLimitWindow).filter(Boolean);
  return {
    provider: provider || payload?.provider || "codex",
    source: String(payload?.source || fallbackSource),
    updatedAt: payload?.updatedAt || new Date().toISOString(),
    windows,
  };
}

function providerEnvValue(provider, suffix, { legacyCodex = false } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const providerKey = normalizedProvider.toUpperCase();
  const phoneKey = `PHONE_${providerKey}_${suffix}`;
  const shortKey = `${providerKey}_${suffix}`;
  if (process.env[phoneKey] !== undefined) return process.env[phoneKey];
  if (process.env[shortKey] !== undefined) return process.env[shortKey];
  if (legacyCodex && normalizedProvider === "codex") {
    const legacyKey = `PHONE_${suffix}`;
    if (process.env[legacyKey] !== undefined) return process.env[legacyKey];
  }
  return undefined;
}

function envRateLimitSnapshot(provider) {
  if (provider !== "codex") return null;
  const json = providerEnvValue(provider, "RATE_LIMITS_JSON", { legacyCodex: true });
  if (json) {
    try {
      return normalizeRateLimitSnapshot(JSON.parse(json), "env", provider);
    } catch (error) {
      return { provider, source: "env", windows: [], error: error.message };
    }
  }
  const hasShortLimit = ["RATE_LIMIT_SHORT_LABEL", "RATE_LIMIT_SHORT_PERCENT", "RATE_LIMIT_SHORT_RESET"].some(
    (suffix) => providerEnvValue(provider, suffix, { legacyCodex: true }) !== undefined,
  );
  const hasWeeklyLimit = ["RATE_LIMIT_WEEKLY_LABEL", "RATE_LIMIT_WEEKLY_PERCENT", "RATE_LIMIT_WEEKLY_RESET"].some(
    (suffix) => providerEnvValue(provider, suffix, { legacyCodex: true }) !== undefined,
  );
  const windows = [
    hasShortLimit
      ? sanitizeRateLimitWindow({
          label: providerEnvValue(provider, "RATE_LIMIT_SHORT_LABEL", { legacyCodex: true }) || "5時間",
          remainingPercent: providerEnvValue(provider, "RATE_LIMIT_SHORT_PERCENT", { legacyCodex: true }),
          resetsAt: providerEnvValue(provider, "RATE_LIMIT_SHORT_RESET", { legacyCodex: true }),
        })
      : null,
    hasWeeklyLimit
      ? sanitizeRateLimitWindow({
          label: providerEnvValue(provider, "RATE_LIMIT_WEEKLY_LABEL", { legacyCodex: true }) || "週あたり",
          remainingPercent: providerEnvValue(provider, "RATE_LIMIT_WEEKLY_PERCENT", { legacyCodex: true }),
          resetsAt: providerEnvValue(provider, "RATE_LIMIT_WEEKLY_RESET", { legacyCodex: true }),
        })
      : null,
  ].filter(Boolean);
  return windows.length ? { provider, source: "env", updatedAt: new Date().toISOString(), windows } : null;
}

function rateLimitCachePathForProvider(provider) {
  if (provider !== "codex") return "";
  const configured = providerEnvValue(provider, "RATE_LIMIT_CACHE_PATH", { legacyCodex: true });
  return configured ? path.resolve(configured) : path.join(root, ".phone-rate-limits.json");
}

function readRateLimitCache(provider) {
  const cachePath = rateLimitCachePathForProvider(provider);
  if (!cachePath || !fs.existsSync(cachePath)) return null;
  try {
    const snapshot = normalizeRateLimitSnapshot(JSON.parse(fs.readFileSync(cachePath, "utf8")), "cache", provider);
    const updatedAtMs = Date.parse(snapshot.updatedAt);
    if (Number.isFinite(updatedAtMs)) snapshot.stale = Date.now() - updatedAtMs > rateLimitCacheTtlMs;
    return snapshot;
  } catch (error) {
    return { provider, source: "cache", windows: [], error: error.message };
  }
}

function writeRateLimitCache(provider, snapshot) {
  const cachePath = rateLimitCachePathForProvider(provider);
  if (!cachePath) return;
  try {
    fs.writeFileSync(cachePath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  } catch {
    return;
  }
  try {
    fs.chmodSync(cachePath, 0o600);
  } catch {
    // Best effort: rate-limit metadata remains usable if chmod is unavailable.
  }
}

function parseRefreshCommand(command) {
  const input = String(command || "").trim();
  if (!input) return null;
  if (/[|&;<>()`$\\\r\n]/.test(input)) throw new Error("rate limit command must not use shell metacharacters");
  const parts = input.match(/"([^"]*)"|'([^']*)'|\S+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) || [];
  if (!parts.length) return null;
  return { command: parts[0], args: parts.slice(1) };
}

function runRateLimitRefreshCommand(provider, command) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const parsed = parseRefreshCommand(command);
    if (!parsed) {
      reject(new Error("rate limit command is empty"));
      return;
    }
    const child = spawn(parsed.command, parsed.args, {
      cwd: root,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`rate limit command timed out after ${rateLimitRefreshTimeoutMs}ms`));
    }, rateLimitRefreshTimeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 64_000) child.kill("SIGTERM");
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error((stderr || `rate limit command exited with ${signal || code}`).trim()));
        return;
      }
      try {
        const snapshot = normalizeRateLimitSnapshot(JSON.parse(stdout), "command", provider);
        if (!snapshot.windows.length) throw new Error("rate limit command returned no windows");
        resolve(snapshot);
      } catch (error) {
        reject(new Error(`invalid rate limit command output: ${error.message}`));
      }
    });
  });
}

async function rateLimitSnapshot({ provider = agentProvider, refresh = false } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider !== "codex") return { provider: normalizedProvider, source: "unavailable", windows: [] };
  const envSnapshot = envRateLimitSnapshot(normalizedProvider);
  if (envSnapshot) return envSnapshot;
  const command = String(providerEnvValue(normalizedProvider, "RATE_LIMIT_REFRESH_COMMAND", { legacyCodex: true }) || "").trim();
  const cached = readRateLimitCache(normalizedProvider);
  if (refresh && command) {
    try {
      const snapshot = await runRateLimitRefreshCommand(normalizedProvider, command);
      writeRateLimitCache(normalizedProvider, snapshot);
      return snapshot;
    } catch (error) {
      if (cached && cached.windows?.length) return { ...cached, stale: true, error: error.message };
      return { provider: normalizedProvider, source: "command", windows: [], error: error.message };
    }
  }
  if (cached) return cached;
  return { provider: normalizedProvider, source: command ? "command" : "unavailable", windows: [] };
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

function pluginIsInstalled(summary = {}) {
  const status = String(summary.status || summary.installStatus || summary.installationStatus || "").toLowerCase();
  return Boolean(summary.enabled || summary.installed || status === "installed" || status === "enabled");
}

function shortPluginName(name = "") {
  return String(name || "").split("@")[0];
}

function normalizeSkillEntry(skill, pluginSummary = {}, marketplace = {}) {
  const source = skill?.summary || skill || {};
  const name = source.name || source.title || source.id || pluginSummary.name || pluginSummary.id;
  if (!name) return null;
  const pluginName = shortPluginName(pluginSummary.name || pluginSummary.id || "");
  const skillName = String(name);
  const qualifiedName = skillName.includes(":") || !pluginName ? skillName : `${pluginName}:${skillName}`;
  return {
    id: source.id && String(source.id).includes(":") ? source.id : qualifiedName,
    name: qualifiedName,
    description: source.description || source.summary || pluginSummary.description || "",
    trigger: source.trigger || source.command || `/${qualifiedName}`,
    pluginId: pluginSummary.id || pluginSummary.name || "",
    pluginName,
    marketplaceId: marketplace.id || marketplace.name || "",
    marketplaceName: marketplace.name || marketplace.id || "",
  };
}

function frontmatterValue(text, key) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return "";
  const line = match[1].split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}:`));
  if (!line) return "";
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

function discoverSkillFiles(baseDir, { maxDepth = 5 } = {}) {
  const files = [];
  const base = path.resolve(baseDir || "");
  if (!base || !fs.existsSync(base) || !fs.statSync(base).isDirectory()) return files;
  const ignored = new Set([".git", "node_modules", "assets", "scripts", "references"]);
  function walk(dir, depth) {
    if (depth < 0) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(target);
        continue;
      }
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      walk(target, depth - 1);
    }
  }
  walk(base, maxDepth);
  return files;
}

function skillEntryFromFile(filePath, pluginSummary = {}, marketplace = {}) {
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const name = frontmatterValue(text, "name") || path.basename(path.dirname(filePath));
  const description = frontmatterValue(text, "description") || pluginSummary.description || "";
  return normalizeSkillEntry({ id: name, name, description }, pluginSummary, marketplace);
}

function pluginSourcePath(plugin = {}, summary = {}) {
  return plugin.source?.path || summary.source?.path || plugin.path || summary.path || "";
}

function skillEntriesForInstalledPlugin(plugin = {}, marketplace = {}) {
  const summary = plugin.summary || plugin;
  const skillFiles = discoverSkillFiles(pluginSourcePath(plugin, summary));
  const fileEntries = skillFiles
    .map((filePath) => skillEntryFromFile(filePath, summary, marketplace))
    .filter(Boolean);
  if (fileEntries.length) return fileEntries;
  const skills = summary.skills || plugin.skills || summary.skillEntries || plugin.skillEntries || [];
  const entries = skills.length ? skills : [summary];
  return entries.map((skill) => normalizeSkillEntry(skill, summary, marketplace)).filter(Boolean);
}

function installedSkillsFromPluginMarketplaces(marketplaces = []) {
  return mergeSkillEntries(
    (marketplaces || []).flatMap((marketplace) => {
      const skills = [];
      for (const plugin of marketplace.plugins || marketplace.entries || []) {
        const summary = plugin.summary || plugin;
        if (!pluginIsInstalled(summary)) continue;
        skills.push(...skillEntriesForInstalledPlugin(plugin, marketplace));
      }
      return skills;
    }),
  );
}

function installedLocalSkillEntries(home = codexHome) {
  const skillsDir = path.join(home, "skills");
  return mergeSkillEntries(discoverSkillFiles(skillsDir).map((filePath) => skillEntryFromFile(filePath)).filter(Boolean));
}

function mergeSkillEntries(...entryLists) {
  const byId = new Map();
  for (const entryList of entryLists) {
    for (const entry of entryList || []) byId.set(entry.id || entry.name, entry);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function queryProvider(url, res) {
  try {
    return normalizeProvider(url.searchParams.get("provider") || agentProvider);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return null;
  }
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
  const automationsDir = path.join(codexHome, "automations");
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

function claudeProjectDirFor(cwd = workdir) {
  return path.join(claudeProjectsRoot, path.resolve(cwd).replace(/[^A-Za-z0-9]/g, "-"));
}

function textFromClaudeContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function claudeSessionFilePath(sessionId) {
  const id = String(sessionId || "").trim();
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  const base = path.resolve(claudeProjectDirFor());
  const target = path.resolve(base, `${id}.jsonl`);
  if (!target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

function parseClaudeSessionFile(filePath, text, stat) {
  const sessionId = path.basename(filePath, ".jsonl");
  const history = [];
  let title = "";
  let firstUserText = "";
  let lastUserText = "";
  let cwd = workdir;
  let createdAt = Number.POSITIVE_INFINITY;
  let updatedAt = stat.mtimeMs;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    if (item.cwd) cwd = item.cwd;
    if (item.type === "ai-title" && item.aiTitle) title = String(item.aiTitle);
    const timestamp = Date.parse(item.timestamp || "");
    if (Number.isFinite(timestamp)) {
      createdAt = Math.min(createdAt, timestamp);
      updatedAt = Math.max(updatedAt, timestamp);
    }
    if (item.type !== "user" && item.type !== "assistant") continue;
    const text = textFromClaudeContent(item.message?.content);
    if (!text.trim()) continue;
    const role = item.message?.role === "assistant" || item.type === "assistant" ? "assistant" : "user";
    if (role === "user") {
      if (!firstUserText) firstUserText = text;
      lastUserText = text;
    }
    history.push({
      type: role === "assistant" ? "assistant" : "user",
      text,
      outputGroup: item.uuid || item.requestId || sessionId,
    });
  }

  const fallbackTitle = firstUserText || sessionId;
  const firstTimestamp = Number.isFinite(createdAt) ? createdAt : stat.birthtimeMs;
  return {
    summary: {
      id: sessionId,
      name: title || fallbackTitle,
      preview: lastUserText || fallbackTitle,
      cwd,
      provider: "claude",
      updatedAt,
      updated_at: updatedAt,
      createdAt: firstTimestamp,
      created_at: firstTimestamp,
    },
    history: capHistory(history),
  };
}

function readClaudeSessionFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  return parseClaudeSessionFile(filePath, fs.readFileSync(filePath, "utf8"), stat);
}

async function readClaudeSessionFileAsync(filePath) {
  if (!filePath) return null;
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;
    return parseClaudeSessionFile(filePath, await fs.promises.readFile(filePath, "utf8"), stat);
  } catch {
    return null;
  }
}

function claudeHistoryForSession(sessionId) {
  return readClaudeSessionFile(claudeSessionFilePath(sessionId))?.history || [];
}

function localThreadList() {
  return Array.from(bridges.values()).map((bridge) => {
    const userEntry = [...bridge.history].reverse().find((entry) => entry.type === "user");
    const preview = userEntry?.text || bridge.threadId;
    const updatedAt = Date.now();
    return {
      id: bridge.threadId,
      name: preview.split("\n").find(Boolean) || bridge.threadId,
      preview,
      cwd: workdir,
      provider: agentProvider,
      updatedAt,
      updated_at: updatedAt,
    };
  });
}

async function claudeThreadListPayload() {
  const byId = new Map();
  const dir = claudeProjectDirFor();
  let fileNames = [];
  try {
    fileNames = await fs.promises.readdir(dir);
  } catch {
    fileNames = [];
  }
  const sessions = await Promise.all(
    fileNames.filter((fileName) => fileName.endsWith(".jsonl")).map((fileName) => readClaudeSessionFileAsync(path.join(dir, fileName))),
  );
  for (const session of sessions) {
    if (session) byId.set(session.summary.id, session.summary);
  }
  for (const thread of localThreadList()) {
    const existing = byId.get(thread.id);
    byId.set(thread.id, {
      ...existing,
      ...thread,
      name: thread.name === thread.id && existing?.name ? existing.name : thread.name,
      preview: thread.preview === thread.id && existing?.preview ? existing.preview : thread.preview,
    });
  }
  return {
    provider: "claude",
    activeProvider: agentProvider,
    data: Array.from(byId.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
  };
}

function claudePermissionMode(options = {}) {
  if (options.permissionMode) return options.permissionMode;
  if (options.sandboxMode === "danger-full-access" || options.approvalPolicy === "never") return "bypassPermissions";
  if (options.sandboxMode === "read-only") return "plan";
  return process.env.CLAUDE_PERMISSION_MODE || "acceptEdits";
}

function summarizeClaudeAttachmentPrompt(text, savedAttachments) {
  if (!savedAttachments.length) return text;
  const lines = savedAttachments.map((file) => `- ${file.name}: ${file.absolutePath}`);
  return `${text || "添付ファイルを確認してください。"}\n\n添付ファイルはMac側に保存済みです。必要ならこのパスを読み取って処理してください:\n${lines.join("\n")}`;
}

class SharedBridge {
  constructor(requestedThreadId, bridgeKey, options = {}) {
    this.requestedThreadId = requestedThreadId;
    this.bridgeKey = bridgeKey;
    this.fallbackOnMissingThread = Boolean(options.fallbackOnMissingThread);
    this.cwd = options.cwd || workdir;
    this.clients = new Set();
    this.nextId = 1;
    this.pending = new Map();
    this.threadId = null;
    this.activeTurnId = null;
    this.ready = false;
    this.startupFailed = false;
    this.history = [];
    this.turnQueue = [];
    this.approvalPolicy = "on-request";
    this.sandboxMode = "workspace-write";
    this.runState = { state: "connecting", label: "接続中", turnId: null, updatedAt: Date.now() };
    this.streamingStarted = false;
    this.interruptRequested = false;
    this.fellBackFromStaleThreadId = "";
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
        approvalStore.clearForBridge(this.bridgeKey, "closed");
        this.upstream.close();
        bridges.delete(this.bridgeKey);
      }
    });
  }

  readyPayload() {
    return {
      provider: agentProvider,
      threadId: this.threadId,
      model,
      workdir: this.cwd,
      ...currentWorkspaceMeta(),
      shared: true,
      clients: this.clients.size,
      history: this.history,
      pendingApprovals: this.pendingApprovalSummaries(),
      run: this.runPayload(),
    };
  }

  pendingApprovalSummaries() {
    return approvalStore
      .list({ status: "pending", bridgeKey: this.bridgeKey })
      .map((record) => approvalRecordForClient(record))
      .filter(Boolean);
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
      const initializeId = this.request("initialize", {
        clientInfo: { name: "codex-phone-bridge", title: "Codex Phone Bridge", version: "0.1.0" },
      });
      if (!initializeId) return;
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
      this.startThreadRequest(method, params);
      this.emit("status", { text: this.requestedThreadId ? "既存threadを再開中..." : "新しいthreadを開始中..." });
    });

    this.upstream.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      const pendingMethod = this.pending.get(msg.id);

      if (pendingMethod === "thread/start" || pendingMethod === "thread/resume") {
        this.pending.delete(msg.id);
        if (msg.error) {
          const text = msg.error.message || JSON.stringify(msg.error);
          if (pendingMethod === "thread/resume" && this.fallbackOnMissingThread && isMissingThreadError(text)) {
            this.fellBackFromStaleThreadId = this.requestedThreadId;
            this.fallbackOnMissingThread = false;
            clearLastThreadId(this.requestedThreadId);
            this.requestedThreadId = "";
            this.emit("status", { text: "保存済みthreadが見つからないため、新しいthreadを開始中..." });
            this.startThreadRequest("thread/start", {
              model,
              cwd: this.cwd,
              approvalPolicy: "on-request",
              sandbox: "workspace-write",
            });
            return;
          }
          this.startupFailed = true;
          this.emit("error", { text });
          return;
        }
        this.threadId = msg.result.thread.id;
        writeLastThreadId(this.threadId);
        writeLastThreadCwd(this.cwd);
        threadCwdMap.set(this.threadId, this.cwd);
        if (this.fellBackFromStaleThreadId) {
          const staleThreadId = this.fellBackFromStaleThreadId;
          this.fellBackFromStaleThreadId = "";
          if (bridges.get(staleThreadId) === this) bridges.delete(staleThreadId);
          this.bridgeKey = this.threadId;
          bridges.set(this.bridgeKey, this);
        }
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
          if (problem.severity === "error") {
            this.setBridgeRunState("error", "開始に失敗", this.activeTurnId);
            notifyRunEvent("failed", { threadId: this.threadId || problem.threadId, message: problem.text });
          }
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
        notifyRunEvent("completed", { threadId: this.threadId, turnId: completedTurnId });
        this.syncHistory("turn completed");
        this.startNextQueuedTurn();
        return;
      }

      if (isApprovalRequest(msg)) {
        const approval = approvalRecordForClient(
          approvalStore.register({
            bridgeKey: this.bridgeKey,
            threadId: this.threadId,
            turnId: this.activeTurnId,
            request: msg,
          }),
        );
        if (approval && this.shouldAutoApprove()) {
          this.approval(approval.approvalId, "accept", { auto: true });
          return;
        }
        this.setBridgeRunState("approval", "承認待ち", this.activeTurnId);
        this.emit("approval", { approval, request: msg });
        notifyRunEvent("approval", {
          threadId: this.threadId,
          turnId: this.activeTurnId,
          message: msg.method,
        });
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
      this.finishInterruptedTurn(error.message, { restartQueued: false });
    });
    this.upstream.on("close", () => {
      if (!this.ready) this.startupFailed = true;
      approvalStore.clearForBridge(this.bridgeKey, "closed");
      this.markUpstreamClosed("Codex接続が閉じました。再接続ボタンを押してください。");
    });
  }

  startThreadRequest(method, params) {
    const id = this.request(method, params);
    if (!id) return null;
    this.pending.set(id, method);
    return id;
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

  finishInterruptedTurn(reason, { restartQueued = true } = {}) {
    const hadActiveTurn = Boolean(this.activeTurnId || this.hasPendingTurnStart());
    this.activeTurnId = null;
    for (const [id, method] of this.pending) {
      if (method === "turn/start") this.pending.delete(id);
    }
    approvalStore.clearForBridge(this.bridgeKey, "interrupted");
    if (hadActiveTurn) this.emit("turn", { status: "interrupted", reason });
    if (restartQueued) this.startNextQueuedTurn();
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
    if (options.approvalPolicy) {
      params.approvalPolicy = options.approvalPolicy;
      this.approvalPolicy = options.approvalPolicy;
    }
    if (options.sandboxMode) {
      params.sandboxPolicy = sandboxPolicyForMode(options.sandboxMode, this.cwd);
      this.sandboxMode = options.sandboxMode;
    }
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

  shouldAutoApprove() {
    return this.approvalPolicy === "never" && this.sandboxMode === "danger-full-access";
  }

  approval(approvalIdOrRequest, decision, options = {}) {
    const approvalId =
      typeof approvalIdOrRequest === "string" ? approvalIdOrRequest : approvalIdOrRequest?.approvalId || `${this.bridgeKey}:${approvalIdOrRequest?.id}`;
    const result = approvalStore.resolveDetailed(approvalId, decision);
    if (result.status !== "resolved") {
      this.emit("approvalResolved", { approvalId, status: result.status });
      this.emit("status", { text: "承認状態を最新に同期しました。" });
      return;
    }
    const record = result.record;
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
      this.markUpstreamClosed();
      return;
    }
    this.upstream.send(JSON.stringify({ id: record.request.id, result: approvalResultForDecision(record.request, decision, { acceptForSession: options.auto }) }));
    this.emit("approvalResolved", { approvalId, status: "resolved", decision: record.decision, auto: Boolean(options.auto) });
    this.emit("status", { text: options.auto ? "フルアクセス設定により承認を自動処理しました。" : decision === "accept" ? "承認しました" : "拒否しました" });
  }
}

class ClaudeBridge {
  constructor(requestedThreadId, bridgeKey, options = {}) {
    this.requestedThreadId = requestedThreadId;
    this.bridgeKey = bridgeKey;
    this.cwd = options.cwd || workdir;
    this.clients = new Set();
    this.threadId = requestedThreadId || crypto.randomUUID();
    this.activeTurnId = null;
    this.ready = true;
    this.startupFailed = false;
    this.history = requestedThreadId ? claudeHistoryForSession(requestedThreadId) : [];
    this.turnQueue = [];
    this.child = null;
    this.runState = { state: "ready", label: "待機中", turnId: null, updatedAt: Date.now() };
    process.nextTick(() => {
      this.emit("ready", this.readyPayload());
      if (!requestedThreadId) this.emit("status", { text: `新しいClaude sessionを開始しました: ${this.threadId}` });
    });
  }

  addClient(browser) {
    this.clients.add(browser);
    this.emitTo(browser, "status", { text: "共有Claudeブリッジに参加しました。" });
    this.emitTo(browser, "ready", this.readyPayload());
    browser.on("close", () => {
      this.clients.delete(browser);
      if (shouldDisposeIdleBridge({ clientCount: this.clients.size, ready: this.ready })) {
        if (this.child && !this.child.killed) this.child.kill("SIGTERM");
        bridges.delete(this.bridgeKey);
      }
    });
  }

  readyPayload() {
    return {
      provider: agentProvider,
      threadId: this.threadId,
      model,
      workdir: this.cwd,
      ...currentWorkspaceMeta(),
      shared: true,
      clients: this.clients.size,
      history: this.history,
      pendingApprovals: [],
      run: this.runPayload(),
    };
  }

  runPayload() {
    return this.runState;
  }

  setBridgeRunState(state, label, turnId = this.activeTurnId) {
    this.runState = { state, label, turnId: turnId || null, updatedAt: Date.now() };
    this.emit("runState", { run: this.runPayload() });
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

  prompt(text, attachments = [], options = {}) {
    if (this.child || this.activeTurnId) {
      this.turnQueue.push({ text, attachments, options });
      this.emit("status", { text: `キューに追加しました（${this.turnQueue.length}件待機）` });
      return;
    }
    this.startPrompt(text, attachments, options);
  }

  startPrompt(text, attachments = [], options = {}) {
    const savedAttachments = [];
    for (const attachment of attachments || []) {
      const saved = saveDataUrlAttachment(attachment);
      if (saved) savedAttachments.push({ ...saved.preview, absolutePath: saved.input.path });
    }
    const promptText = summarizeClaudeAttachmentPrompt(text, savedAttachments);
    const displayText = savedAttachments.length ? `${text}\n\n添付: ${savedAttachments.map((file) => file.name).join(", ")}` : text;
    this.history = capHistory([...this.history, { type: "user", text: displayText, attachments: savedAttachments }]);
    this.emit("user", { text: displayText, attachments: savedAttachments });
    this.activeTurnId = crypto.randomUUID();
    this.setBridgeRunState("running", "Claude 処理中", this.activeTurnId);

    const args = ["-p", promptText];
    if (this.requestedThreadId) args.unshift("--resume", this.requestedThreadId);
    const permissionMode = claudePermissionMode(options);
    if (permissionMode) args.unshift("--permission-mode", permissionMode);
    const child = spawn(claudeBin, args, {
      cwd: this.cwd,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: claudeProjectDirFor(this.cwd),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const textChunk = chunk.toString();
      stdout += textChunk;
      this.setBridgeRunState("streaming", "回答生成中", this.activeTurnId);
      this.emit("assistantDelta", { text: textChunk });
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      this.child = null;
      this.activeTurnId = null;
      this.setBridgeRunState("error", "Claude起動エラー");
      this.emit("error", { text: error.message });
      this.startNextQueuedTurn();
    });
    child.on("close", (code) => {
      this.child = null;
      const completedTurnId = this.activeTurnId;
      this.activeTurnId = null;
      const output = stripUiDirectives(stdout.trim());
      if (output) this.history = capHistory([...this.history, { type: "assistant", text: output }]);
      if (code === 0) {
        this.setBridgeRunState("done", "完了しました", completedTurnId);
        this.emit("turn", { status: "completed", turnId: completedTurnId, run: this.runPayload() });
      } else {
        this.setBridgeRunState("error", "Claude実行エラー", completedTurnId);
        this.emit("error", { text: (stderr || `Claude exited with code ${code}`).trim() });
      }
      this.startNextQueuedTurn();
    });
  }

  startNextQueuedTurn() {
    if (this.child || this.activeTurnId || !this.turnQueue.length) return;
    const next = this.turnQueue.shift();
    this.emit("status", { text: `キューから送信中（残り${this.turnQueue.length}件）` });
    this.startPrompt(next.text, next.attachments, next.options);
  }

  interrupt() {
    const queuedCount = this.turnQueue.length;
    this.turnQueue = [];
    if (queuedCount) this.emit("status", { text: `待機中の送信を破棄しました（${queuedCount}件）。` });
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      this.setBridgeRunState("interrupting", "中断中", this.activeTurnId);
      return;
    }
    this.emit("status", { text: "中断できる処理はありません。" });
  }

  approval() {
    this.emit("status", { text: "Claude providerでは承認UIは未使用です。" });
  }
}

const threadCwdMap = new Map();

function bridgeClassForProvider(provider = agentProvider) {
  return provider === "claude" ? ClaudeBridge : SharedBridge;
}

function getBridge(threadId, connectionId = crypto.randomUUID(), options = {}) {
  const savedCwd = readLastThreadCwd();
  const persistedThreadId = !threadId && !options.forceNew && savedCwd === workdir ? readLastThreadId() : "";
  const BridgeClass = bridgeClassForProvider();
  const requestedThreadId = options.forceNew ? "" : threadId || persistedThreadId;
  if (!threadId && persistedThreadId) {
    if (bridges.has(persistedThreadId)) return bridges.get(persistedThreadId);
    const bridge = new BridgeClass(persistedThreadId, persistedThreadId, { fallbackOnMissingThread: true, cwd: workdir });
    bridges.set(persistedThreadId, bridge);
    return bridge;
  }
  if (!threadId && !options.forceNew) {
    for (const bridge of bridges.values()) {
      if (!bridge.requestedThreadId) return bridge;
    }
  }
  const key = options.forceNew && !requestedThreadId ? `new:${connectionId}` : bridgeKeyForRequest(requestedThreadId, connectionId);
  const cwd = options.cwd || (requestedThreadId ? threadCwdMap.get(requestedThreadId) : undefined) || workdir;
  if (!bridges.has(key)) bridges.set(key, new BridgeClass(requestedThreadId, key, { cwd }));
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
    if (msg.type === "interrupt") {
      if (typeof bridge.interrupt === "function") bridge.interrupt();
      else bridge.emitTo(browser, "status", { text: `${providerLabel()} providerでは実行中の中断は未対応です。` });
    }
    if (msg.type === "approval") bridge.approval(msg.approvalId || msg.request, msg.decision);
  });
}

async function main() {
  const phoneToken = tokenRequired ? getToken() : "";
  const codex = shouldStartCodexServer ? startCodexServer() : null;
  if (shouldStartCodexServer) {
    await waitForReady();
  } else if (isCodexProvider) {
    await appServerRequest("thread/loaded/list", { cursor: null, limit: 1 });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/info") {
      sendJson(res, 200, {
        provider: agentProvider,
        model,
        workdir,
        codexUrl: isCodexProvider ? codexUrl : null,
        codexSocketPath: isCodexProvider ? codexSocketPath || null : null,
        managedCodexServer: shouldStartCodexServer,
        tokenRequired,
        authMode,
      });
      return;
    }
    if (url.pathname === "/api/threads") {
      if (!requireToken(url, phoneToken, res)) return;
      const requestedProvider = queryProvider(url, res);
      if (!requestedProvider) return;
      if (requestedProvider === "claude") {
        sendJson(res, 200, await claudeThreadListPayload());
        return;
      }
      try {
        const result = await appServerRequest("thread/list", {
          limit: 30,
          sortKey: "updated_at",
          sortDirection: "desc",
          archived: false,
          useStateDbOnly: false,
        });
        sendJson(res, 200, { ...result, provider: requestedProvider, activeProvider: agentProvider });
      } catch (error) {
        if (requestedProvider !== agentProvider) {
          sendJson(res, 200, { provider: requestedProvider, activeProvider: agentProvider, data: [], unavailable: error.message });
          return;
        }
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/live-threads") {
      if (!requireToken(url, phoneToken, res)) return;
      const requestedProvider = queryProvider(url, res);
      if (!requestedProvider) return;
      if (requestedProvider !== "codex") {
        sendJson(res, 200, { provider: requestedProvider, activeProvider: agentProvider, data: [] });
        return;
      }
      sendJson(res, 200, {
        provider: requestedProvider,
        activeProvider: agentProvider,
        data: liveThreadSummaries(bridges),
      });
      return;
    }
    if (url.pathname === "/api/models") {
      if (!requireToken(url, phoneToken, res)) return;
      if (isClaudeProvider) {
        sendJson(res, 200, {
          data: modelOptions.map((item) => ({ id: item, model: item, displayName: item })),
        });
        return;
      }
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
      if (isClaudeProvider) {
        sendJson(res, 200, { data: [] });
        return;
      }
      try {
        const result = await appServerRequest("plugin/list", { cwds: [workdir] });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/skills") {
      if (!requireToken(url, phoneToken, res)) return;
      if (isClaudeProvider) {
        sendJson(res, 200, { data: [] });
        return;
      }
      try {
        const result = await appServerRequest("plugin/list", { cwds: [workdir] });
        const marketplaces = result.marketplaces || result.data || [];
        sendJson(res, 200, {
          data: mergeSkillEntries(installedSkillsFromPluginMarketplaces(marketplaces), installedLocalSkillEntries()),
          marketplaces,
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/config") {
      if (!requireToken(url, phoneToken, res)) return;
      if (isClaudeProvider) {
        sendJson(res, 200, {
          config: { config: { model, cwd: workdir, provider: agentProvider } },
          auth: { authMethod: "claude-cli" },
          errors: [],
        });
        return;
      }
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
      const workspaceMeta = await refreshWorkspaceMeta();
      const refreshRateLimits = url.searchParams.get("refreshRateLimits") === "1";
      sendJson(res, 200, {
        provider: agentProvider,
        workdir,
        ...workspaceMeta,
        model,
        codexUrl: isCodexProvider ? codexUrl : null,
        codexSocketPath: isCodexProvider ? codexSocketPath || null : null,
        managedCodexServer: shouldStartCodexServer,
        historySyncEnabled,
        tokenRequired,
        authMode,
        rateLimits: await rateLimitSnapshot({ provider: agentProvider, refresh: refreshRateLimits }),
        uiPort,
        codexPort,
        bridges: Array.from(bridges.values()).map((bridge) => ({
          threadId: bridge.threadId,
          workdir: bridge.cwd,
          clients: bridge.clients.size,
          ready: bridge.ready,
          provider: agentProvider,
        })),
      });
      return;
    }
    if (url.pathname === "/api/history-sync") {
      if (!requireToken(url, phoneToken, res)) return;
      if (isClaudeProvider) {
        sendJson(res, 200, { skipped: true, reason: "history sync is only available for the Codex provider" });
        return;
      }
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
      const requestedProvider = queryProvider(url, res);
      if (!requestedProvider) return;
      if (!threadId) {
        sendJson(res, 400, { error: "thread is required" });
        return;
      }
      if (requestedProvider === "claude") {
        const bridge = Array.from(bridges.values()).find((item) => item.threadId === threadId || item.bridgeKey === threadId);
        sendJson(res, 200, {
          provider: requestedProvider,
          activeProvider: agentProvider,
          threadId,
          history: bridge?.history?.length ? bridge.history : claudeHistoryForSession(threadId),
        });
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
        sendJson(res, 200, { provider: requestedProvider, activeProvider: agentProvider, ...snapshot });
      } catch (error) {
        if (requestedProvider !== agentProvider) {
          sendJson(res, 200, { provider: requestedProvider, activeProvider: agentProvider, threadId, history: [], unavailable: error.message });
          return;
        }
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
    const requestedCwd = url.searchParams.get("cwd");
    const safeCwd = requestedCwd ? safeDirectoryPath(requestedCwd, os.homedir()) : null;
    if (requestedCwd && !safeCwd) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      bindBrowser(ws, phoneToken, threadId, { forceNew: url.searchParams.get("new") === "1", cwd: safeCwd?.absolute }),
    );
  });

  server.listen(uiPort, listenHost, () => {
    const addresses = tokenRequired || debugLan ? lanAddresses() : ["127.0.0.1"];
    const urls = bridgeUrls(addresses, uiPort, phoneToken);
    notificationBridgeUrls = urls;
    console.log("");
    console.log(`${isClaudeProvider ? "Claude" : "Codex"} shared browser bridge is ready.`);
    for (const url of urls) console.log(`  ${url}`);
    console.log("");
    console.log(`Auth:    ${tokenRequired ? "token" : debugLan ? "debug-no-token (LAN exposed)" : "debug-no-token (localhost only)"}`);
    console.log(`Listen:  ${listenHost}:${uiPort}`);
    console.log(`Provider:${agentProvider}`);
    console.log(`Workdir: ${workdir}`);
    console.log(`Model:   ${model}`);
    if (isCodexProvider) console.log(`Codex:   ${shouldStartCodexServer ? codexUrl : codexSocketPath || codexUrl}`);
    else console.log(`Claude:  ${claudeBin}`);
    if (tokenRequired) console.log("Open the same URL from PC and phone to share one bridge thread.");
    else if (debugLan) console.log("Tokenless debug LAN mode is exposed to this network. Use only on a trusted LAN.");
    else console.log("Open the URL on this Mac only; tokenless debug mode is not exposed to the LAN.");
    console.log("Press Ctrl+C to stop.");

    if (!tokenRequired) {
      console.log("[notify] skipped in debug-no-token mode");
      return;
    }

    notifyBridgeUrls(urls)
      .then((results) => logNotifyResults("startup", results))
      .catch((error) => console.warn(`[notify] startup error: ${error.message}`));
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
    bridgeClassForProvider,
    decorateReviewFiles,
    discoverWorkspaceEntries,
    installedLocalSkillEntries,
    installedSkillsFromPluginMarketplaces,
    mergeSkillEntries,
    parseRefreshCommand,
    relativeDisplayPath,
    readDirectoryListing,
    readSkills,
    reviewSummary,
    runGit,
    clearLastThreadId,
    isMissingThreadError,
    readLastThreadCwd,
    readLastThreadId,
    safeDirectoryPath,
    safeOpenPath,
    safePathWithin,
    safeRelativePath,
    safeWorkdirPath,
    writeLastThreadCwd,
    writeLastThreadId,
  };
}
