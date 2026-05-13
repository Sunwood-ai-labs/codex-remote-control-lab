const log = document.querySelector("#log");
const meta = document.querySelector("#meta");
const connectButton = document.querySelector("#connect");
const newThreadButton = document.querySelector("#newThread");
const searchButton = document.querySelector("#searchButton");
const pluginsButton = document.querySelector("#pluginsButton");
const automationsButton = document.querySelector("#automationsButton");
const settingsButton = document.querySelector("#settingsButton");
const menuButton = document.querySelector("#menuButton");
const closePanelButton = document.querySelector("#closePanelButton");
const addButton = document.querySelector("#addButton");
const accessButton = document.querySelector("#accessButton");
const modelButton = document.querySelector("#modelButton");
const modelMenu = document.querySelector("#modelMenu");
const expandPromptButton = document.querySelector("#expandPromptButton");
const voiceButton = document.querySelector("#voiceButton");
const fileInput = document.querySelector("#fileInput");
const attachments = document.querySelector("#attachments");
const mobileThreadsButton = document.querySelector("#mobileThreads");
const sidebarScrim = document.querySelector("#sidebarScrim");
const sidebar = document.querySelector("#threadSidebar");
const artifactPanel = document.querySelector(".artifact-panel");
const artifactButtons = document.querySelectorAll("[data-artifact]");
const artifactTitle = document.querySelector("#artifactTitle");
const artifactList = document.querySelector("#artifactList");
const artifactPreview = document.querySelector("#artifactPreview");
const artifactTab = document.querySelector("#artifactTab");
const workspaceTab = document.querySelector("#workspaceTab");
const reviewTab = document.querySelector("#reviewTab");
const panelTabButtons = document.querySelectorAll("[data-panel-tab]");
const statusButton = document.querySelector("#statusButton");
const webSearchButton = document.querySelector("#webSearchButton");
const runState = document.querySelector("#runState");
const runStateLabel = document.querySelector("#runStateLabel");
const threadList = document.querySelector("#threadList");
const threadSearch = document.querySelector("#threadSearch");
const threadTitle = document.querySelector("#threadTitle");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#prompt");
const promptModal = document.querySelector("#promptModal");
const promptModalInput = document.querySelector("#promptModalInput");
const closePromptModalButton = document.querySelector("#closePromptModalButton");
const cancelPromptModalButton = document.querySelector("#cancelPromptModalButton");
const applyPromptModalButton = document.querySelector("#applyPromptModalButton");
const slashSuggestions = document.querySelector("#slashSuggestions");
const sendButton = document.querySelector("#send");
const interruptButton = document.querySelector("#interruptRun");
const workspaceIndicator = document.querySelector("#workspaceIndicator");
const workspaceRepo = document.querySelector("#workspaceRepo");
const workspaceLocation = document.querySelector("#workspaceLocation");
const branchName = document.querySelector("#branchName");
const approval = document.querySelector("#approval");
const approvalText = document.querySelector("#approvalText");
const approveButton = document.querySelector("#approve");
const declineButton = document.querySelector("#decline");
const leftResizeHandle = document.querySelector("#leftResizeHandle");
const rightResizeHandle = document.querySelector("#rightResizeHandle");

const params = new URLSearchParams(location.search);
const token = params.get("token") || localStorage.getItem("codexPhoneToken") || "";
let selectedThread = params.get("thread") || localStorage.getItem("codexPhoneLastThread") || "";
let activeProvider = "codex";
let threadProvider = params.get("provider") || "";
let tokenRequired = true;
let authMode = "token";
if (token) localStorage.setItem("codexPhoneToken", token);
if (params.has("token") && window.history?.replaceState) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete("token");
  window.history.replaceState({}, document.title, cleanUrl);
}

const themeOptions = [
  { id: "simple", name: "シンプル", detail: "静かなローカルコンソール" },
  { id: "cyberpunk", name: "サイバーパンク", detail: "緑の端末文字 / 流れるコード背景" },
  { id: "botanical", name: "ボタニカル", detail: "グリーン / 温かみのあるクリーム" },
  { id: "stigmata", name: "Stigmata", detail: "氷青 / 銀白 / 赤い販売機の残光" },
];
let selectedTheme = localStorage.getItem("codexPhoneTheme") || "simple";

let ws = null;
let pendingApproval = null;
let assistantEntry = null;
let statusGroup = null;
let threadCache = [];
let liveTurnActive = false;
let lastHistorySignature = "";
let visibleHistoryThread = selectedThread;
const maxThreadHistoryCacheSize = 50;
const threadHistoryCache = new Map();
const threadReadyNonce = new Map();
let lastThreadListError = "";
let lastThreadRefreshError = "";
let selectedThreadRefreshActive = false;
let selectedModel = localStorage.getItem("codexPhoneModel") || "";
let selectedModelLabel = localStorage.getItem("codexPhoneModelLabel") || "5.5";
let selectedReasoning = localStorage.getItem("codexPhoneReasoning") || "中";
let settingsRenderSeq = 0;
let artifactItems = [];
let activeArtifactPath = "";
let suppressArtifactTouchClickUntil = 0;
let activePanel = "artifacts";
let currentWorkdir = "";
let nextThreadCwd = "";
let forceNewThreadOnce = false;
let currentRunState = "connecting";
let interruptRequestPending = false;
let currentWorkspace = {
  repoName: "",
  workspaceLocation: "",
  gitBranch: "",
};
let accessMode = {
  label: "フルアクセス",
  approvalPolicy: "never",
  sandboxMode: "danger-full-access",
};
let pendingFiles = [];
let lastReviewDigestSignature = "";
let slashSkillMenu = null;
let slashSkills = [];
let slashSkillsLoaded = false;
let slashSkillsPromise = null;
let slashActiveIndex = 0;
let activeSlashMatch = null;
let slashCommandsCache = [];

function normalizeProviderName(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (value === "codex" || value === "claude") return value;
  return "";
}

function providerLabel(provider) {
  return provider === "claude" ? "Claude" : "Codex";
}

function currentThreadProvider() {
  return normalizeProviderName(threadProvider || activeProvider) || "codex";
}

function setActiveProvider(provider) {
  activeProvider = normalizeProviderName(provider) || "codex";
  if (!threadProvider) threadProvider = activeProvider;
  document.documentElement.dataset.provider = activeProvider;
}

const panelWidthConfig = {
  left: { min: 188, max: 360, fallback: 232, storageKey: "codexLeftSidebarWidth", cssVar: "--thread-width" },
  right: { min: 280, max: 760, fallback: 420, storageKey: "codexRightSidebarWidth", cssVar: "--dock-width" },
};

const runStateText = {
  connecting: "接続中",
  ready: "待機中",
  running: "Codex 処理中",
  streaming: "回答生成中",
  reconnecting: "再接続中",
  approval: "承認待ち",
  interrupting: "中断中",
  interrupted: "中断しました",
  syncing: "履歴同期中",
  done: "完了",
  disconnected: "切断",
  error: "エラー",
};
const interruptibleRunStates = new Set(["running", "streaming", "approval", "interrupting"]);
const terminalRunStates = new Set(["ready", "done", "interrupted", "disconnected", "error"]);

function updateInterruptButton() {
  if (!interruptButton) return;
  const visible = interruptibleRunStates.has(currentRunState);
  const disabled =
    !visible || currentRunState === "interrupting" || interruptRequestPending || !ws || ws.readyState !== WebSocket.OPEN;
  let label = "現在の処理を中断";
  if (visible && (currentRunState === "interrupting" || interruptRequestPending)) label = "中断要求を送信中です";
  else if (visible && (!ws || ws.readyState !== WebSocket.OPEN)) label = "接続後に処理を中断";
  interruptButton.classList.toggle("hidden", !visible);
  interruptButton.disabled = disabled;
  interruptButton.title = label;
  interruptButton.setAttribute("aria-label", label);
}

function setRunState(state, label) {
  if (!runState || !runStateLabel) return;
  const nextLabel = label || runStateText[state] || state;
  currentRunState = state;
  if (terminalRunStates.has(state)) interruptRequestPending = false;
  if (state !== "approval" && pendingApproval) {
    pendingApproval = null;
    approval.classList.add("hidden");
  }
  if (runState.dataset.state !== state || runStateLabel.textContent !== nextLabel) {
    runState.dataset.state = state;
    runStateLabel.textContent = nextLabel;
  }
  updateInterruptButton();
}

function compactWorkspaceLocation(location) {
  const value = String(location || ".").replace(/\\/g, "/");
  if (value === "." || value === "~") return value;
  const prefix = value.startsWith("~/") ? "~/" : value.startsWith("/") ? "/" : "";
  const body = prefix ? value.slice(prefix.length) : value;
  const parts = body.split("/").filter(Boolean);
  if (parts.length <= 2) return value;
  return `${prefix}.../${parts.slice(-2).join("/")}`;
}

function setWorkspaceMeta(payload = {}) {
  const repoName = String(payload.repoName || currentWorkspace.repoName || "").trim();
  const location = String(payload.workspaceLocation || currentWorkspace.workspaceLocation || "").trim();
  const branch = String(payload.gitBranch || payload.branch || currentWorkspace.gitBranch || "").trim();
  currentWorkspace = { repoName, workspaceLocation: location, gitBranch: branch };
  if (!workspaceIndicator || !workspaceRepo || !workspaceLocation || !branchName) return;
  const hasMeta = Boolean(repoName || location || branch);
  workspaceIndicator.classList.toggle("empty", !hasMeta);
  workspaceRepo.textContent = repoName || "リポジトリ";
  workspaceRepo.title = repoName || "";
  workspaceLocation.textContent = compactWorkspaceLocation(location || ".");
  workspaceLocation.title = location || ".";
  branchName.textContent = branch || "不明";
  branchName.title = branch || "";
  workspaceIndicator.setAttribute(
    "aria-label",
    `現在のワークスペース: ${repoName || "不明"} ${location || "."} ${branch || "不明"}`,
  );
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

function pickErrorPayload(raw) {
  const value = parseMaybeJson(raw);
  if (!value || typeof value !== "object") return { message: String(raw || "Codex error") };
  if (value.error) return value.error;
  if (value.params?.error) return value.params.error;
  return value;
}

function normalizeUiError(raw) {
  const problem = pickErrorPayload(raw);
  const detail = typeof problem === "string" ? problem : JSON.stringify(problem);
  const message = String(problem.message || problem.additionalDetails || raw || "Codex error");
  const streamDisconnected = Boolean(problem.codexErrorInfo?.responseStreamDisconnected);
  const retrying = Boolean(problem.willRetry) || /^Reconnecting\.\.\./i.test(message);
  if (streamDisconnected && retrying) {
    return {
      state: "reconnecting",
      kind: "status",
      text: `Codex応答ストリームが一時切断されました。再接続中です。${message ? ` (${message})` : ""}`,
      detail,
    };
  }
  if (streamDisconnected) {
    return {
      state: "error",
      kind: "error",
      text: "Codex応答ストリームが切断されました。再接続後にもう一度送信してください。",
      detail,
    };
  }
  return {
    state: "error",
    kind: "error",
    text: message,
    detail,
  };
}

function applyTheme(themeId) {
  const nextTheme = themeOptions.some((theme) => theme.id === themeId) ? themeId : "simple";
  selectedTheme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("codexPhoneTheme", nextTheme);
}

applyTheme(selectedTheme);

const accessModes = [
  { label: "フルアクセス", approvalPolicy: "never", sandboxMode: "danger-full-access" },
  { label: "確認モード", approvalPolicy: "on-request", sandboxMode: "workspace-write" },
  { label: "読み取り専用", approvalPolicy: "on-request", sandboxMode: "read-only" },
];

const fontAwesomeIcons = {
  chevronDown: {
    viewBox: "0 0 448 512",
    path: "M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z",
  },
  folder: {
    viewBox: "0 0 512 512",
    path: "M64 448l384 0c35.3 0 64-28.7 64-64l0-240c0-35.3-28.7-64-64-64L298.7 80c-6.9 0-13.7-2.2-19.2-6.4L241.1 44.8C230 36.5 216.5 32 202.7 32L64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64z",
  },
  folderPlus: {
    viewBox: "0 0 512 512",
    path: "M512 384c0 35.3-28.7 64-64 64L64 448c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l138.7 0c13.8 0 27.3 4.5 38.4 12.8l38.4 28.8c5.5 4.2 12.3 6.4 19.2 6.4L448 80c35.3 0 64 28.7 64 64l0 240zM256 160c-13.3 0-24 10.7-24 24l0 48-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0 0 48c0 13.3 10.7 24 24 24s24-10.7 24-24l0-48 48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0 0-48c0-13.3-10.7-24-24-24z",
  },
};

function fontAwesomeIcon(name, className) {
  const icon = fontAwesomeIcons[name];
  return `<svg class="${className}" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="${name}" role="img" viewBox="${icon.viewBox}" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="${icon.path}"></path></svg>`;
}

function setAccessButtonLabel() {
  accessButton.innerHTML = `<span class="access-label">${escapeHtml(accessMode.label)}</span>${fontAwesomeIcon("chevronDown", "button-chevron-icon")}`;
}

function updateModelButton() {
  const showReasoning = activeProvider === "codex";
  const label = showReasoning ? `${selectedModelLabel} ${selectedReasoning}` : selectedModelLabel;
  modelButton.innerHTML = `<span class="model-button-label">${escapeHtml(label)}</span>${fontAwesomeIcon("chevronDown", "button-chevron-icon")}`;
  modelButton.setAttribute("aria-label", showReasoning ? `モデル ${selectedModelLabel}、インテリジェンス ${selectedReasoning}` : `モデル ${selectedModelLabel}`);
  for (const row of modelMenu.querySelectorAll("[data-reasoning]")) {
    row.hidden = !showReasoning;
    const active = row.dataset.reasoning === selectedReasoning;
    row.classList.toggle("active", active);
    row.setAttribute("aria-checked", String(active));
    let mark = row.querySelector(".checkmark");
    if (active && !mark) {
      mark = document.createElement("span");
      mark.className = "checkmark";
      mark.textContent = "✓";
      row.appendChild(mark);
    } else if (!active && mark) {
      mark.remove();
    }
  }
  for (const row of modelMenu.querySelectorAll("[data-model-choice]")) {
    row.hidden = activeProvider !== "codex";
    const active = row.dataset.modelChoice === selectedModel;
    row.classList.toggle("active", active);
    row.setAttribute("aria-checked", String(active));
  }
}

function closeModelMenu() {
  modelMenu.classList.add("hidden");
  modelButton.setAttribute("aria-expanded", "false");
}

function toggleModelMenu() {
  updateModelButton();
  modelMenu.classList.toggle("hidden");
  const expanded = String(!modelMenu.classList.contains("hidden"));
  modelButton.setAttribute("aria-expanded", expanded);
}

function normalizeRateLimitWindows(rateLimits) {
  const rawWindows = Array.isArray(rateLimits) ? rateLimits : rateLimits?.windows || rateLimits?.limits || [];
  return rawWindows
    .map((item) => {
      const remainingPercent = Number(item.remainingPercent ?? item.remaining ?? item.percent);
      const label = String(item.label || item.window || item.name || "").trim();
      const resetsAt = String(item.resetsAt || item.resetAt || item.reset || "").trim();
      if (!label && !Number.isFinite(remainingPercent) && !resetsAt) return null;
      return {
        label: label || "制限",
        remainingPercent: Number.isFinite(remainingPercent) ? Math.max(0, Math.min(100, Math.round(remainingPercent))) : null,
        resetsAt,
      };
    })
    .filter(Boolean);
}

function addRateLimitPanelRows(rateLimits) {
  const windows = normalizeRateLimitWindows(rateLimits);
  if (!windows.length) {
    const detail = rateLimits?.error ? "取得エラー" : rateLimits?.source === "unavailable" ? "取得元未設定" : "未取得";
    addPanelRow("レート制限", detail);
    return;
  }
  for (const item of windows) {
    const percent = item.remainingPercent === null ? "--" : `${item.remainingPercent}%`;
    addPanelRow(`レート制限 ${item.label}`, item.resetsAt ? `${percent} / ${item.resetsAt}` : percent);
  }
}

function selectReasoning(value) {
  selectedReasoning = value;
  localStorage.setItem("codexPhoneReasoning", value);
  updateModelButton();
  closeModelMenu();
  addStatus(`インテリジェンスを ${value} に設定しました。`);
}

function selectModel(model) {
  selectedModel = model;
  selectedModelLabel = model.replace(/^gpt-/i, "").replace(/^claude-/i, "");
  if (activeProvider === "codex") selectedModelLabel = selectedModelLabel.toUpperCase();
  if (selectedModelLabel.startsWith("5.")) selectedModelLabel = selectedModelLabel;
  localStorage.setItem("codexPhoneModel", selectedModel);
  localStorage.setItem("codexPhoneModelLabel", selectedModelLabel);
  updateModelButton();
  closeModelMenu();
  addStatus(`モデルを ${model.toUpperCase()} に設定しました。次の送信から反映します。`);
}

function syncSidebarState({ focus = false } = {}) {
  const open = document.body.classList.contains("show-sidebar");
  mobileThreadsButton.setAttribute("aria-expanded", String(open));
  sidebar?.setAttribute("aria-hidden", String(!open && window.matchMedia("(max-width: 820px)").matches));
  if (open && focus) {
    const target = sidebar?.querySelector("button, input, [href], [tabindex]:not([tabindex='-1'])");
    target?.focus();
  }
}

function openSidebar({ focus = false } = {}) {
  document.body.classList.add("show-sidebar");
  syncSidebarState({ focus });
}

function closeSidebar({ restoreFocus = false } = {}) {
  const wasOpen = document.body.classList.contains("show-sidebar");
  document.body.classList.remove("show-sidebar");
  syncSidebarState();
  if (restoreFocus && wasOpen) mobileThreadsButton.focus();
}

function syncRightPanelState({ focus = false } = {}) {
  const open = !document.body.classList.contains("hide-artifacts") || document.body.classList.contains("show-panel");
  menuButton.setAttribute("aria-pressed", String(open));
  menuButton.setAttribute("aria-expanded", String(open));
  artifactPanel?.setAttribute("aria-hidden", String(!open));
  if (open && focus) {
    const target = artifactPanel?.querySelector("button, input, textarea, [href], [tabindex]:not([tabindex='-1'])");
    target?.focus();
  }
}

function titleForThread(thread) {
  const raw = thread.name || thread.preview || thread.cwd || thread.id;
  const firstLine = raw.split("\n").find(Boolean) || thread.id;
  return firstLine.length > 54 ? `${firstLine.slice(0, 54)}...` : firstLine;
}

function projectForThread(thread) {
  const cwd = String(thread.cwd || "").replace(/\/+$/, "");
  if (!cwd) return "No project";
  return cwd.split("/").filter(Boolean).pop() || cwd;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const days = Math.floor(diffSeconds / 86400);
  const months = Math.floor(days / 30);
  if (diffSeconds < 3600) return "今";
  if (hours < 24) return `${hours}時間`;
  if (days < 30) return `${days}日`;
  return `${months || 1}か月`;
}

function isBlockStart(line) {
  return (
    /^```/.test(line) ||
    /^#{1,4}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line)
  );
}

function sanitizeHref(value) {
  try {
    const url = new URL(value, location.href);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return url.href;
  } catch {
    return "";
  }
  return "";
}

function isImageHref(value) {
  return /\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(String(value || ""));
}

function normalizeImageHref(value) {
  if (/^https?:\/\//i.test(value)) return value;
  const clean = String(value || "").replace(/^\.\//, "");
  if (clean.startsWith("/api/file/raw") || clean.startsWith("/api/uploaded")) return urlWithToken(clean);
  const localPath = clean.replace(/[?#].*$/, "");
  const repoImage = localPath.match(/(?:^|[/\\])(docs[/\\](?:assets|public)[/\\].+\.(?:png|jpe?g|gif|webp|svg))$/i);
  if (repoImage) {
    const relativeAsset = repoImage[1].replace(/\\/g, "/");
    return urlWithToken(`/api/file/raw?path=${encodeURIComponent(relativeAsset)}`);
  }
  if (/^[^?#]+\/[^?#]+\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(clean)) {
    return urlWithToken(`/api/file/raw?path=${encodeURIComponent(localPath)}`);
  }
  if (/^[^/\\]+$/.test(clean) && isImageHref(clean)) {
    return urlWithToken(`/api/file/raw?path=${encodeURIComponent(`docs/assets/${clean}`)}`);
  }
  return value;
}

function sanitizeMarkdownHtml(html) {
  const allowedTags = new Set([
    "A",
    "B",
    "BR",
    "CODE",
    "DEL",
    "DETAILS",
    "DIV",
    "EM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "IMG",
    "KBD",
    "P",
    "PRE",
    "S",
    "SPAN",
    "STRONG",
    "SUB",
    "SUMMARY",
    "SUP",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "UL",
    "OL",
    "LI",
  ]);
  const template = document.createElement("template");
  template.innerHTML = html;

  const sanitizeNode = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE || !allowedTags.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent || ""));
        continue;
      }

      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
          child.removeAttribute(attribute.name);
          continue;
        }
        if (child.tagName === "A" && name === "href") {
          const safeHref = sanitizeHref(value);
          if (safeHref) {
            child.setAttribute("href", safeHref);
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noreferrer");
          } else {
            child.removeAttribute(attribute.name);
          }
          continue;
        }
        if (child.tagName === "IMG" && name === "src") {
          child.setAttribute("src", normalizeImageHref(value));
          child.setAttribute("loading", "lazy");
          continue;
        }
        if (child.tagName === "IMG" && ["alt", "width", "height"].includes(name)) continue;
        if (["align", "colspan", "rowspan"].includes(name)) continue;
        child.removeAttribute(attribute.name);
      }

      sanitizeNode(child);
    }
  };

  sanitizeNode(template.content);
  return template.innerHTML;
}

function isHtmlBlockStart(line) {
  return /^<\/?(p|div|table|thead|tbody|tr|td|th|a|img|br|h[1-6]|details|summary)\b/i.test(line.trim());
}

function renderInlineMarkdown(text) {
  const codeTokens = [];
  const imageTokens = [];
  let source = String(text).replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(escapeHtml(code));
    return token;
  });

  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, href) => {
    if (!isImageHref(href)) return _;
    const token = `\u0000IMAGE${imageTokens.length}\u0000`;
    imageTokens.push({ name: label || href.split("/").pop(), url: normalizeImageHref(href) });
    return token;
  });

  source = escapeHtml(source)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      if (isImageHref(href)) {
        const token = `\u0000IMAGE${imageTokens.length}\u0000`;
        imageTokens.push({ name: label, url: normalizeImageHref(href) });
        return token;
      }
      const safeHref = sanitizeHref(href);
      if (!safeHref) return label;
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");

  return source
    .replace(/\u0000CODE(\d+)\u0000/g, (_, index) => `<code>${codeTokens[Number(index)] || ""}</code>`)
    .replace(/\u0000IMAGE(\d+)\u0000/g, (_, index) => {
      const image = imageTokens[Number(index)];
      if (!image) return "";
      return `<figure class="image-preview markdown-image"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || "image")}" loading="lazy"><figcaption>${escapeHtml(image.name || "image")}</figcaption></figure>`;
    });
}

function renderMarkdown(text, options = {}) {
  const headingOffset = options.headingOffset ?? 1;
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (options.allowHtml && isHtmlBlockStart(line)) {
      const html = [line];
      const open = line.trim().match(/^<([a-z0-9]+)\b/i)?.[1]?.toLowerCase();
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        open &&
        !new RegExp(`</${open}>`, "i").test(html.join("\n"))
      ) {
        html.push(lines[index]);
        index += 1;
      }
      blocks.push(sanitizeMarkdownHtml(html.join("\n")));
      continue;
    }

    const fence = line.match(/^```\s*([a-z0-9_-]+)?\s*$/i);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` data-language="${escapeHtml(fence[1])}"` : "";
      blocks.push(`<pre${language}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + headingOffset, 6);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quote.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("");
}

function stripUiDirectives(text) {
  return String(text || "")
    .replace(/(?:^|\n)::[a-z0-9-]+\{[^\n]*\}(?=\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function setEntryText(body, kind, text) {
  body.markdownSource = kind === "assistant" ? stripUiDirectives(text) : text || "";
  if (kind === "assistant" || kind === "user") body.innerHTML = renderMarkdown(body.markdownSource);
  else body.textContent = body.markdownSource;
}

function urlWithToken(url) {
  const target = new URL(url, location.href);
  if (tokenRequired && token) target.searchParams.set("token", token);
  return target.pathname + target.search;
}

function renderImageGallery(images = []) {
  if (!images.length) return null;
  const gallery = document.createElement("div");
  gallery.className = "image-gallery";
  for (const image of images) {
    const figure = document.createElement("figure");
    figure.className = "image-preview";
    const img = document.createElement("img");
    img.src = image.dataUrl || urlWithToken(image.url);
    img.alt = image.name || "添付画像";
    img.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.textContent = image.name || "image";
    figure.append(img, caption);
    gallery.appendChild(figure);
  }
  return gallery;
}

function fileKindLabel(kind) {
  if (kind === "markdown") return "ドキュメント・MD";
  if (kind === "image") return "画像";
  return "ファイル";
}

function diffStatLabel(file) {
  const additions = Number(file.additions || 0);
  const deletions = Number(file.deletions || 0);
  return `<span class="diff-add">+${additions}</span><span class="diff-del">-${deletions}</span>`;
}

function shouldDisplayReviewFile(file) {
  return Boolean(file?.path && (file.openable || Number(file.additions || 0) || Number(file.deletions || 0)));
}

function renderReviewDigest(result) {
  const files = (result?.files || []).filter(shouldDisplayReviewFile);
  if (!result || result.clean || !files.length) return null;
  const openableFiles = files.filter((file) => file.openable).slice(0, 6);
  const totalFiles = files.length;
  const totals =
    result.totals && files.length === result.files?.length
      ? result.totals
      : files.reduce(
          (sum, file) => ({
            additions: sum.additions + Number(file.additions || 0),
            deletions: sum.deletions + Number(file.deletions || 0),
          }),
          { additions: 0, deletions: 0 },
        );
  const sourceLabel = result.source === "latest commit" ? "最新commit" : "作業ツリー";
  const wrap = document.createElement("section");
  wrap.className = "review-digest";
  wrap.innerHTML = `
    <details class="review-reference-toggle">
      <summary>${totalFiles}件の変更ファイル・${sourceLabel}</summary>
    </details>
    <div class="artifact-card-list"></div>
    <div class="diff-card">
      <div class="diff-card-header">
        <strong>${totalFiles}個のファイルが変更されました</strong>
        <span>${diffStatLabel({ additions: totals.additions, deletions: totals.deletions })}</span>
      </div>
      <div class="diff-file-list"></div>
    </div>
  `;
  const citation = wrap.querySelector(".review-reference-toggle");
  citation.dataset.reviewDigest = "true";
  const artifactListNode = wrap.querySelector(".artifact-card-list");
  for (const file of openableFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-artifact-card";
    button.dataset.openArtifactPath = file.path;
    button.innerHTML = `
      <span class="chat-artifact-icon" aria-hidden="true">${file.kind === "image" ? "IMG" : "DOC"}</span>
      <span class="chat-artifact-copy">
        <strong>${escapeHtml(file.path.split(/[\\/]/).pop() || file.path)}</strong>
        <small>${escapeHtml(fileKindLabel(file.kind))}</small>
      </span>
      <span class="chat-artifact-open">開く</span>
    `;
    bindArtifactOpenTrigger(button);
    artifactListNode.appendChild(button);
  }
  if (!openableFiles.length) artifactListNode.remove();

  const diffList = wrap.querySelector(".diff-file-list");
  for (const file of files.slice(0, 12)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "diff-file-row";
    if (file.openable) row.dataset.openArtifactPath = file.path;
    row.innerHTML = `
      <span class="diff-file-name">${escapeHtml(file.path)}</span>
      <span class="diff-file-stat">${diffStatLabel(file)}</span>
      <span class="diff-file-chevron" aria-hidden="true">⌄</span>
    `;
    if (file.openable) bindArtifactOpenTrigger(row);
    diffList.appendChild(row);
  }
  return wrap;
}

async function appendReviewDigest() {
  if (tokenRequired && !token) return;
  try {
    const result = await apiGet("/api/review");
    const signature = JSON.stringify({
      branch: result.branch,
      files: (result.files || []).map((file) => [file.status, file.path, file.additions, file.deletions]),
    });
    const existingDigests = Array.from(log.querySelectorAll(".review-digest-entry"));
    if (signature === lastReviewDigestSignature && existingDigests.length) return;
    lastReviewDigestSignature = signature;
    const digest = renderReviewDigest(result);
    for (const existing of existingDigests) existing.remove();
    if (!digest) return;
    const el = document.createElement("article");
    el.className = "entry assistant review-digest-entry";
    const body = document.createElement("div");
    body.className = "entry-body";
    body.appendChild(digest);
    const tools = document.createElement("div");
    tools.className = "entry-tools";
    el.append(body, tools);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  } catch (error) {
    addStatus(`差分サマリーを更新できませんでした: ${error.message}`);
  }
}

function summarizeStatus(items) {
  if (items.some((item) => item.includes("音声入力"))) return "音声入力";
  const reads = items.filter((item) => /^Read\s+/i.test(item)).length;
  const commands = items.filter((item) => /command|コマンド|\$\s/.test(item)).length;
  const files = items.filter((item) => /file|ファイル/i.test(item)).length;
  const parts = [];
  if (reads) parts.push(`${reads}個のファイルを調査`);
  if (commands) parts.push(`${commands}件のコマンドを実行`);
  if (files && !reads) parts.push(`${files}件のファイル操作`);
  return parts.length ? parts.join("、") : `${items.length}件の作業ログ`;
}

function updateStatusGroup(group) {
  const count = group.items.length;
  group.summaryText.textContent = summarizeStatus(group.items);
  group.count.textContent = `${count}件`;
  group.list.replaceChildren(
    ...group.items.map((item) => {
      const row = document.createElement("li");
      row.textContent = item;
      return row;
    }),
  );
}

function addStatusGroupItem(text) {
  if (!statusGroup || statusGroup.items.length >= 12) {
    const el = document.createElement("article");
    el.className = "entry status status-group";

    const avatar = document.createElement("div");
    avatar.className = "entry-avatar";
    avatar.textContent = "›";

    const details = document.createElement("details");
    details.className = "status-details";

    const summary = document.createElement("summary");
    const summaryText = document.createElement("span");
    summaryText.className = "status-summary-text";
    const count = document.createElement("span");
    count.className = "status-count";
    summary.append(summaryText, count);

    const list = document.createElement("ul");
    list.className = "status-list";
    details.append(summary, list);

    const tools = document.createElement("div");
    tools.className = "entry-tools";

    el.append(avatar, details, tools);
    log.appendChild(el);
    statusGroup = { items: [], summaryText, count, list };
  }
  statusGroup.items.push(text);
  updateStatusGroup(statusGroup);
  log.scrollTop = log.scrollHeight;
}

function addEntry(kind, text, images = []) {
  if (kind === "status") {
    addStatusGroupItem(text);
    return null;
  }
  if (kind === "user" && !String(text || "").trim() && !images.length) return null;
  statusGroup = null;
  const el = document.createElement("article");
  el.className = `entry ${kind}`;

  const avatar = document.createElement("div");
  avatar.className = "entry-avatar";
  avatar.textContent = kind === "user" ? "U" : kind === "assistant" ? "C" : "›";

  const body = document.createElement("div");
  body.className = "entry-body";
  setEntryText(body, kind, text);
  const gallery = kind === "user" ? renderImageGallery(images) : null;
  if (gallery) body.appendChild(gallery);

  const tools = document.createElement("div");
  tools.className = "entry-tools";
  if (kind === "assistant" || kind === "user") {
    tools.innerHTML = '<button type="button" class="entry-tool-button" data-message-action="copy" aria-label="メッセージをコピー" title="コピー"></button>';
  }

  el.append(avatar, body, tools);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return body;
}

function addStatus(text) {
  addStatusGroupItem(text);
}

function isNetworkDisconnectMessage(message) {
  return /Failed to fetch|NetworkError|Load failed|Couldn'?t connect|Connection refused/i.test(String(message || ""));
}

function shouldSuppressBackgroundFetchError(message) {
  return isNetworkDisconnectMessage(message) && (!ws || ws.readyState !== WebSocket.OPEN);
}

function setReady(ready) {
  sendButton.disabled = !ready;
  promptInput.disabled = !ready;
  updateInterruptButton();
}

function showPendingApproval(approvalRequest) {
  const request = approvalRequest || {};
  pendingApproval = request;
  setRunState("approval");
  approvalText.textContent = JSON.stringify(request.params || {}, null, 2);
  approval.classList.remove("hidden");
}

function renderHistory(history) {
  log.replaceChildren();
  statusGroup = null;
  for (const entry of history || []) addEntry(entry.type, entry.text, entry.attachments || []);
}

function cloneHistory(history = []) {
  if (typeof structuredClone === "function") return structuredClone(history);
  return JSON.parse(JSON.stringify(history || []));
}

function pruneThreadCaches() {
  while (threadHistoryCache.size > maxThreadHistoryCacheSize) {
    const oldestThreadId = threadHistoryCache.keys().next().value;
    threadHistoryCache.delete(oldestThreadId);
    threadReadyNonce.delete(oldestThreadId);
  }
}

function rememberThreadHistory(threadId, history) {
  if (!threadId) return;
  threadHistoryCache.delete(threadId);
  threadHistoryCache.set(threadId, cloneHistory(history));
  pruneThreadCaches();
}

function incrementThreadReadyNonce(threadId) {
  if (!threadId) return;
  threadReadyNonce.set(threadId, (threadReadyNonce.get(threadId) || 0) + 1);
  pruneThreadCaches();
}

function historySignature(history = []) {
  return JSON.stringify(
    history.map((entry) => ({
      type: entry.type,
      text: entry.text || "",
      attachments: (entry.attachments || []).map((attachment) => attachment.name || attachment.url || ""),
    })),
  );
}

function renderHistoryIfChanged(history = [], { threadId = selectedThread, cache = true } = {}) {
  const signature = historySignature(history);
  if (cache) rememberThreadHistory(threadId, history);
  if (signature === lastHistorySignature && visibleHistoryThread === threadId) return false;
  lastHistorySignature = signature;
  visibleHistoryThread = threadId;
  renderHistory(history);
  appendReviewDigest();
  return true;
}

function prepareThreadHistoryForConnect(threadId) {
  if (!threadId) {
    renderHistoryIfChanged([], { threadId: "", cache: false });
    return;
  }
  const cachedHistory = threadHistoryCache.get(threadId);
  if (cachedHistory) renderHistoryIfChanged(cachedHistory, { threadId, cache: false });
  else renderHistoryIfChanged([{ type: "assistant", text: "thread履歴を読み込み中..." }], { threadId, cache: false });
}

function renderThreadList() {
  threadList.replaceChildren();
  const query = threadSearch.value.trim().toLowerCase();
  const newProject = document.createElement("button");
  newProject.type = "button";
  newProject.className = selectedThread ? "project-heading new-project" : "project-heading new-project active";
  newProject.innerHTML = `${fontAwesomeIcon("folderPlus", "project-icon")}<span>New ${providerLabel(currentThreadProvider())} thread</span>`;
  newProject.addEventListener("click", startNewThread);
  threadList.appendChild(newProject);

  const groups = new Map();
  for (const thread of threadCache) {
    const project = projectForThread(thread);
    const title = titleForThread(thread);
    const matches = !query || project.toLowerCase().includes(query) || title.toLowerCase().includes(query);
    if (!matches) continue;
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(thread);
  }

  for (const [project, threads] of groups) {
    const group = document.createElement("section");
    group.className = "project-group";

    const heading = document.createElement("div");
    heading.className = "project-heading";
    const folder = document.createElement("span");
    folder.className = "project-icon-slot";
    folder.innerHTML = fontAwesomeIcon("folder", "project-icon");
    const name = document.createElement("span");
    name.textContent = project;
    heading.append(folder, name);
    group.appendChild(heading);

    const visibleThreads = threads.slice(0, 6);
    for (const thread of visibleThreads) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = thread.id === selectedThread ? "thread-item active" : "thread-item";
      item.title = titleForThread(thread);
      const title = document.createElement("span");
      title.className = "thread-title";
      title.textContent = titleForThread(thread);
      const time = document.createElement("span");
      time.className = "thread-time";
      time.textContent = formatRelativeTime(thread.updatedAt || thread.createdAt);
      item.append(title, time);
      item.addEventListener("click", () => selectThread(thread.id));
      group.appendChild(item);
    }

    if (threads.length > visibleThreads.length) {
      const more = document.createElement("div");
      more.className = "project-more";
      more.textContent = "もっと表示する";
      group.appendChild(more);
    } else if (!visibleThreads.length) {
      const empty = document.createElement("div");
      empty.className = "project-empty";
      empty.textContent = "チャットはありません";
      group.appendChild(empty);
    }
    threadList.appendChild(group);
  }
}

function authQuery() {
  return tokenRequired && token ? `token=${encodeURIComponent(token)}` : "";
}

async function apiGet(path) {
  const separator = path.includes("?") ? "&" : "?";
  const query = authQuery();
  const response = await fetch(query ? `${path}${separator}${query}` : path, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `${response.status} ${response.statusText}`);
  return result;
}

async function loadBridgeInfo() {
  try {
    const info = await apiGet("/api/info");
    setActiveProvider(info.provider || "codex");
    if (info.model) {
      selectedModelLabel = info.model.replace(/^gpt-/i, "").replace(/^claude-/i, "");
      localStorage.setItem("codexPhoneModelLabel", selectedModelLabel);
      updateModelButton();
    }
    tokenRequired = info.tokenRequired !== false;
    authMode = info.authMode || (tokenRequired ? "token" : "debug-no-token");
    if (!tokenRequired) {
      localStorage.removeItem("codexPhoneToken");
      addStatus("デバッグモード: token なしで localhost bridge に接続します。");
    }
    return info;
  } catch (error) {
    addEntry("error", `bridge情報を読めませんでした: ${error.message}`);
    throw error;
  }
}

async function loadThreads({ background = false } = {}) {
  if (tokenRequired && !token) return;
  try {
    const provider = currentThreadProvider();
    const endpoint = provider === "codex" ? "/api/live-threads" : "/api/threads";
    const result = await apiGet(`${endpoint}?provider=${encodeURIComponent(provider)}`);
    if (result.activeProvider) setActiveProvider(result.activeProvider);
    threadCache = (result.data || []).map((thread) => ({ ...thread, provider: result.provider || provider }));
    renderThreadList();
    lastThreadListError = "";
  } catch (error) {
    const message = error.message || String(error);
    if (background && shouldSuppressBackgroundFetchError(message)) {
      lastThreadListError = message;
      return;
    }
    if (message !== lastThreadListError) {
      lastThreadListError = message;
      addEntry("error", `thread一覧を読めませんでした: ${message}`);
    }
    if (!background) throw error;
  }
}

async function refreshSelectedThread() {
  if (!selectedThread || liveTurnActive || selectedThreadRefreshActive) return;
  const requestedThread = selectedThread;
  const startedReadyNonce = threadReadyNonce.get(requestedThread) || 0;
  selectedThreadRefreshActive = true;
  try {
    const result = await apiGet(`/api/thread?thread=${encodeURIComponent(requestedThread)}&provider=${encodeURIComponent(currentThreadProvider())}`);
    if (result.threadId !== requestedThread || result.threadId !== selectedThread) return;
    if ((threadReadyNonce.get(requestedThread) || 0) !== startedReadyNonce) return;
    renderHistoryIfChanged(result.history || [], { threadId: result.threadId });
    lastThreadRefreshError = "";
  } catch (error) {
    const message = error.message || String(error);
    if (recoverMissingSelectedThread(message)) return;
    if (shouldSuppressBackgroundFetchError(message)) return;
    if (message !== lastThreadRefreshError) {
      lastThreadRefreshError = message;
      addEntry("error", `thread更新を読めませんでした: ${message}`);
    }
  } finally {
    selectedThreadRefreshActive = false;
  }
}

async function loadArtifacts() {
  if (tokenRequired && !token) return;
  try {
    const result = await apiGet("/api/artifacts");
    renderArtifactIndex(result.data || []);
  } catch (error) {
    addEntry("error", `artifact一覧を読めませんでした: ${error.message}`);
  }
}

function updateUrlThread() {
  const next = new URL(location.href);
  if (selectedThread) next.searchParams.set("thread", selectedThread);
  else next.searchParams.delete("thread");
  if (currentThreadProvider() !== "codex") next.searchParams.set("provider", currentThreadProvider());
  else next.searchParams.delete("provider");
  history.replaceState(null, "", next);
}

function isMissingThreadError(message) {
  return /no rollout found for thread id|thread not found|no thread found/i.test(String(message || ""));
}

function clearSelectedThread({ reason = "" } = {}) {
  const previousThread = selectedThread;
  selectedThread = "";
  lastThreadRefreshError = "";
  liveTurnActive = false;
  selectedThreadRefreshActive = false;
  updateUrlThread();
  renderHistory([]);
  renderThreadList();
  threadTitle.textContent = "新しい共有thread";
  if (reason) addEntry("status", reason);
  return previousThread;
}

function recoverMissingSelectedThread(message) {
  const staleThread = selectedThread;
  if (!staleThread || !isMissingThreadError(message)) return false;
  clearSelectedThread({ reason: `存在しないthreadを解除しました: ${staleThread}` });
  if (ws) {
    ws.close();
    ws = null;
  }
  connect();
  return true;
}

function syncReadyThread(threadId) {
  if (!threadId) return;
  localStorage.setItem("codexPhoneLastThread", threadId);
  if (selectedThread === threadId) return;
  selectedThread = threadId;
  updateUrlThread();
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  threadTitle.textContent = selected ? titleForThread(selected) : selectedThread;
  renderThreadList();
}

function selectThread(threadId) {
  selectedThread = threadId;
  if (threadId) localStorage.setItem("codexPhoneLastThread", threadId);
  else localStorage.removeItem("codexPhoneLastThread");
  updateUrlThread();
  renderThreadList();
  closeSidebar();
  connect();
}

function setCurrentWorkdir(workdir) {
  currentWorkdir = workdir ?? currentWorkdir;
}

function startNewThread() {
  forceNewThreadOnce = true;
  nextThreadCwd = "";
  selectThread("");
}

function startNewThreadInCwd(cwd) {
  forceNewThreadOnce = true;
  nextThreadCwd = cwd;
  selectThread("");
}

function showRightPanel({ focus = false } = {}) {
  document.body.classList.remove("hide-artifacts");
  document.body.classList.add("show-panel");
  closeSidebar();
  syncRightPanelState({ focus });
}

function closeRightPanel({ restoreFocus = false } = {}) {
  const wasOpen = !document.body.classList.contains("hide-artifacts") || document.body.classList.contains("show-panel");
  document.body.classList.add("hide-artifacts");
  document.body.classList.remove("show-panel");
  syncRightPanelState();
  if (restoreFocus && wasOpen) menuButton.focus();
}

function setActivePanel(panel) {
  activePanel = panel;
  for (const button of panelTabButtons) {
    const active = button.dataset.panelTab === panel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function clearPanel(title, panel = activePanel) {
  showRightPanel();
  setActivePanel(panel);
  artifactTitle.textContent = title;
  artifactList.classList.remove("artifact-browser-list");
  artifactList.replaceChildren();
  activeArtifactPath = "";
  artifactPreview.classList.add("hidden");
  artifactPreview.textContent = "";
}

function addPanelRow(text, detail, onClick, icon = "") {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "artifact-row";
  row.classList.toggle("no-icon", !icon);
  const iconHtml = icon ? `<span class="panel-row-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : "";
  row.innerHTML = detail
    ? `${iconHtml}<span class="panel-row-copy"><strong>${escapeHtml(text)}</strong><small>${escapeHtml(detail)}</small></span>`
    : `${iconHtml}<span class="panel-row-copy">${escapeHtml(text)}</span>`;
  if (onClick) row.addEventListener("click", onClick);
  artifactList.appendChild(row);
  return row;
}

function appendToPrompt(text) {
  promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}${text}`;
  promptInput.focus();
}

function ensureSlashSkillMenu() {
  if (slashSkillMenu) return slashSkillMenu;
  slashSkillMenu = document.createElement("div");
  slashSkillMenu.id = "slashSkillMenu";
  slashSkillMenu.className = "slash-skill-menu hidden";
  slashSkillMenu.setAttribute("role", "listbox");
  slashSkillMenu.setAttribute("aria-label", "インストール済みスキル");
  composer.appendChild(slashSkillMenu);
  return slashSkillMenu;
}

function slashTriggerMatch() {
  const caret = promptInput.selectionStart ?? promptInput.value.length;
  if (promptInput.selectionEnd !== caret) return null;
  const before = promptInput.value.slice(0, caret);
  const match = before.match(/(^|\s)([/／])([\p{L}\p{N}:_-]*)$/u);
  if (!match) return null;
  return { start: caret - match[3].length - match[2].length, end: caret, query: match[3].toLowerCase() };
}

async function loadSlashSkills() {
  if (slashSkillsLoaded) return slashSkills;
  if (slashSkillsPromise) return slashSkillsPromise;
  slashSkillsPromise = apiGet("/api/skills")
    .then((result) => {
      slashSkills = result.data || [];
      slashSkillsLoaded = true;
      return slashSkills;
    })
    .finally(() => {
      slashSkillsPromise = null;
    });
  return slashSkillsPromise;
}

function filterSlashSkills(query) {
  const needle = String(query || "").toLowerCase();
  return slashSkills.filter((skill) => {
    const haystack = `${skill.trigger || ""} ${skill.name || ""} ${skill.id || ""} ${skill.pluginName || ""} ${skill.description || ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function hideSlashSkillMenu() {
  activeSlashMatch = null;
  slashActiveIndex = 0;
  slashSkillMenu?.classList.add("hidden");
  promptInput.removeAttribute("aria-activedescendant");
}

function renderSlashSkillMenu(match) {
  const menu = ensureSlashSkillMenu();
  const options = filterSlashSkills(match.query).slice(0, 8);
  slashActiveIndex = Math.min(slashActiveIndex, Math.max(options.length - 1, 0));
  menu.replaceChildren();
  if (!options.length) {
    const empty = document.createElement("div");
    empty.className = "slash-skill-empty";
    empty.textContent = slashSkills.length ? "一致するスキルはありません" : "インストール済みスキルはありません";
    menu.appendChild(empty);
    menu.classList.remove("hidden");
    return;
  }
  options.forEach((skill, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.id = `slash-skill-${index}`;
    row.className = "slash-skill-row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(index === slashActiveIndex));
    row.innerHTML = `
      <span class="slash-skill-command">${escapeHtml(skill.trigger || `/${skill.name || skill.id}`)}</span>
      <span class="slash-skill-copy">
        <strong>${escapeHtml(skill.name || skill.id)}</strong>
        <small>${escapeHtml(skill.description || skill.pluginName || "installed skill")}</small>
      </span>
    `;
    row.addEventListener("mousedown", (event) => event.preventDefault());
    row.addEventListener("click", () => selectSlashSkill(skill));
    menu.appendChild(row);
  });
  promptInput.setAttribute("aria-activedescendant", `slash-skill-${slashActiveIndex}`);
  menu.classList.remove("hidden");
}

async function updateSlashSkillMenu() {
  const match = slashTriggerMatch();
  if (!match) {
    hideSlashSkillMenu();
    return;
  }
  activeSlashMatch = match;
  ensureSlashSkillMenu().classList.remove("hidden");
  if (!slashSkillsLoaded) ensureSlashSkillMenu().textContent = "読み込み中...";
  try {
    await loadSlashSkills();
    if (!activeSlashMatch) return;
    renderSlashSkillMenu(activeSlashMatch);
  } catch (error) {
    const menu = ensureSlashSkillMenu();
    menu.replaceChildren();
    const row = document.createElement("div");
    row.className = "slash-skill-empty";
    row.textContent = `スキルを読めませんでした: ${error.message}`;
    menu.appendChild(row);
    menu.classList.remove("hidden");
  }
}

function slashMenuRows() {
  return Array.from(ensureSlashSkillMenu().querySelectorAll(".slash-skill-row"));
}

function moveSlashSelection(delta) {
  const rows = slashMenuRows();
  if (!rows.length) return;
  slashActiveIndex = (slashActiveIndex + delta + rows.length) % rows.length;
  rows.forEach((row, index) => row.setAttribute("aria-selected", String(index === slashActiveIndex)));
  promptInput.setAttribute("aria-activedescendant", `slash-skill-${slashActiveIndex}`);
}

function selectSlashSkill(skill) {
  const match = activeSlashMatch || slashTriggerMatch();
  if (!match) return;
  const command = skill.trigger || `/${skill.name || skill.id}`;
  promptInput.value = `${promptInput.value.slice(0, match.start)}${command} ${promptInput.value.slice(match.end)}`;
  const caret = match.start + command.length + 1;
  promptInput.setSelectionRange(caret, caret);
  hideSlashSkillMenu();
  promptInput.focus();
}

function openPromptModal() {
  if (!promptModal || !promptModalInput) return;
  promptModalInput.value = promptInput.value;
  promptModal.classList.remove("hidden");
  document.body.classList.add("prompt-modal-open");
  requestAnimationFrame(() => promptModalInput.focus());
}

function closePromptModal({ apply = false } = {}) {
  if (!promptModal || !promptModalInput) return;
  if (apply) promptInput.value = promptModalInput.value;
  promptModal.classList.add("hidden");
  document.body.classList.remove("prompt-modal-open");
  promptInput.focus();
}

function parseSlashInput(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("/")) return null;
  const match = raw.match(/^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { raw, command: match[1].toLowerCase(), args: (match[2] || "").trim() };
}

async function slashCommands() {
  if (slashCommandsCache.length) return slashCommandsCache;
  const result = await apiGet("/api/slash-commands");
  slashCommandsCache = result.data || [];
  return slashCommandsCache;
}

function findClientSlashCommand(parsed) {
  const name = parsed?.command || "";
  return slashCommandsCache.find((command) => command.name === name || (command.aliases || []).includes(name)) || null;
}

function runnableSlashText(command) {
  const base = `/${command.name}`;
  return command.requiresArgs ? `${base} ` : base;
}

function closeSlashSuggestions() {
  slashSuggestions?.classList.add("hidden");
  slashSuggestions?.replaceChildren();
}

async function updateSlashSuggestions() {
  if (!slashSuggestions) return;
  const value = promptInput.value.trim();
  if (!value.startsWith("/") || value.includes("\n")) {
    closeSlashSuggestions();
    return;
  }
  try {
    const query = value.slice(1).split(/\s+/)[0].toLowerCase();
    const commands = await slashCommands();
    const matches = commands
      .filter((command) => command.name.startsWith(query) || (command.aliases || []).some((alias) => alias.startsWith(query)))
      .slice(0, 8);
    slashSuggestions.replaceChildren();
    for (const command of matches) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "slash-suggestion";
      row.innerHTML = `<strong>${escapeHtml(command.usage || `/${command.name}`)}</strong><small>${escapeHtml(command.description || "")}</small>`;
      row.addEventListener("click", () => {
        const runnable = runnableSlashText(command);
        promptInput.value = runnable;
        promptInput.setSelectionRange(runnable.length, runnable.length);
        promptInput.focus();
        closeSlashSuggestions();
      });
      slashSuggestions.appendChild(row);
    }
    slashSuggestions.classList.toggle("hidden", !matches.length);
  } catch {
    closeSlashSuggestions();
  }
}

function handleClientSlashCommand(parsed) {
  if (parsed?.command === "status") {
    showStatus();
    return true;
  }
  if (parsed?.command === "new") {
    selectThread("");
    return true;
  }
  if (parsed?.command === "commands" || parsed?.command === "help") {
    showSlashCommands();
    return true;
  }
  const command = findClientSlashCommand(parsed);
  if (!command || command.kind !== "client") return false;
  showSlashCommands();
  return true;
}

function renderArtifactIndex(items) {
  artifactItems = items;
  activeArtifactPath = "";
  setActivePanel("artifacts");
  artifactTitle.textContent = "アーティファクト";
  artifactList.classList.add("artifact-browser-list");
  renderArtifactRows();
  hideArtifactPreview();
}

function renderArtifactRows() {
  artifactList.replaceChildren();
  for (const item of artifactItems) {
    const icon = item.kind === "image" ? "IMG" : item.kind === "markdown" ? "MD" : "FILE";
    const label = item.name || item.path?.split(/[\\/]/).filter(Boolean).pop() || "artifact";
    const row = addPanelRow(
      label,
      item.path || "",
      (event) => {
        event.stopPropagation();
        showArtifact(item.path);
      },
      icon
    );
    row.classList.toggle("active", item.path === activeArtifactPath);
  }
  if (!artifactItems.length) addPanelRow("アーティファクトは見つかりませんでした");
}

function hideArtifactPreview() {
  activeArtifactPath = "";
  renderArtifactRows();
  artifactPreview.className = "artifact-preview hidden";
  artifactPreview.textContent = "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function closestElement(target, selector) {
  const element = target instanceof Element ? target : target?.parentElement;
  return element?.closest(selector) || null;
}

function openArtifactFromTrigger(trigger) {
  const path = trigger?.dataset?.openArtifactPath;
  if (!path) return false;
  closeModelMenu();
  showArtifact(path);
  return true;
}

function suppressNextArtifactTouchClick() {
  suppressArtifactTouchClickUntil = Date.now() + 700;
}

function handleArtifactOpenEvent(event) {
  const trigger = event.currentTarget?.dataset?.openArtifactPath
    ? event.currentTarget
    : closestElement(event.target, "[data-open-artifact-path]");
  if (!trigger) return false;
  event.preventDefault();
  event.stopPropagation();
  return openArtifactFromTrigger(trigger);
}

function bindArtifactOpenTrigger(trigger) {
  trigger.addEventListener("click", handleArtifactOpenEvent);
  trigger.addEventListener("pointerdown", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") event.preventDefault();
  });
  trigger.addEventListener("pointerup", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      suppressNextArtifactTouchClick();
      handleArtifactOpenEvent(event);
    }
  });
}

document.addEventListener(
  "click",
  (event) => {
    if (Date.now() >= suppressArtifactTouchClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

function showToolError(name, error) {
  clearPanel(name);
  addPanelRow("読み込みに失敗しました", error.message);
  addEntry("error", `${name}: ${error.message}`);
  document.body.classList.remove("show-sidebar");
}

function getPluginStatus(summary = {}) {
  const state = String(summary.status || summary.state || "").toLowerCase();
  if (summary.enabled || state === "enabled") return "enabled";
  if (summary.installed || state === "installed") return "installed";
  return null;
}

async function showPlugins() {
  clearPanel("プラグイン");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/plugins");
    const marketplaces = result.marketplaces || result.data || [];
    artifactList.replaceChildren();
    for (const marketplace of marketplaces) {
      const plugins = marketplace.plugins || marketplace.entries || [];
      for (const plugin of plugins) {
        const summary = plugin?.summary || plugin || {};
        const status = getPluginStatus(summary);
        if (!status) continue;
        addPanelRow(summary.name || summary.id, status);
      }
    }
    if (!artifactList.children.length) addPanelRow("導入済み/有効なプラグインはありません");
  } catch (error) {
    showToolError("プラグイン", error);
  }
}

async function showAutomations() {
  clearPanel("オートメーション");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/automations");
    artifactList.replaceChildren();
    for (const automation of result.data || []) addPanelRow(automation.name, automation.status);
    if (!artifactList.children.length) addPanelRow("登録済みオートメーションはありません");
  } catch (error) {
    showToolError("オートメーション", error);
  }
}

async function showSkills() {
  clearPanel("スキル", "sources");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/skills");
    artifactList.replaceChildren();
    for (const skill of result.data || []) {
      addPanelRow(skill.name, skill.description || skill.source || "", () => {
        appendToPrompt(`$${skill.name}\n\nこのスキルの手順に従って進めて。`);
        addStatus(`$${skill.name} をチャット入力へ追加しました。`);
      }, "SK");
    }
    if (!artifactList.children.length) addPanelRow("利用可能なスキルは見つかりませんでした");
  } catch (error) {
    showToolError("スキル", error);
  }
}

async function showFolderBrowser(pathValue = "", showHidden = false) {
  clearPanel("フォルダ", "workspace");
  addPanelRow("読み込み中...");
  const query = new URLSearchParams();
  if (pathValue) query.set("path", pathValue);
  if (showHidden) query.set("hidden", "1");
  try {
    const suffix = query.toString() ? `?${query}` : "";
    const listing = await apiGet(`/api/fs/list${suffix}`);
    artifactList.replaceChildren();
    artifactList.classList.add("artifact-browser-list");
    addPanelRow("このフォルダで新しいチャット", listing.path, () => startNewThreadInCwd(listing.path), "NEW");
    addPanelRow(showHidden ? "隠しフォルダを非表示" : "隠しフォルダを表示", listing.path, () => showFolderBrowser(listing.path, !showHidden), "VIS");
    if (listing.parent) addPanelRow("親フォルダへ", listing.parent, () => showFolderBrowser(listing.parent, showHidden), "UP");
    for (const entry of listing.entries || []) {
      addPanelRow(entry.name, entry.path, () => showFolderBrowser(entry.path, showHidden), "DIR");
    }
    if (!listing.entries?.length) addPanelRow("下位フォルダはありません", listing.path);
  } catch (error) {
    if (pathValue) {
      showFolderBrowser("", showHidden);
      return;
    }
    showToolError("フォルダ", error);
  }
}

async function showSettings() {
  const renderSeq = ++settingsRenderSeq;
  clearPanel("設定");
  artifactList.replaceChildren();
  renderThemeSettings();
  const loadingRow = addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/config");
    if (renderSeq !== settingsRenderSeq) return;
    loadingRow.remove();
    const config = result.config?.config || {};
    addPanelRow("Provider", config.provider || activeProvider);
    addPanelRow("認証", result.auth?.authMethod || "unknown");
    addPanelRow("既定モデル", config.model || selectedModel || "unknown");
    addPanelRow("承認", accessMode.approvalPolicy);
    addPanelRow("サンドボックス", accessMode.sandboxMode);
    addPanelRow("作業ディレクトリ", config.cwd || "");
    if (result.errors?.length) addPanelRow("補足エラー", result.errors.join(" / "));
  } catch (error) {
    if (renderSeq !== settingsRenderSeq) return;
    loadingRow.remove();
    addPanelRow("読み込みに失敗しました", error.message);
    addEntry("error", `設定: ${error.message}`);
  }
}

function renderThemeSettings() {
  const group = document.createElement("section");
  group.className = "theme-settings";

  const title = document.createElement("div");
  title.className = "theme-settings-title";
  title.textContent = "カラーテーマ";
  group.appendChild(title);

  const options = document.createElement("div");
  options.className = "theme-options";
  for (const theme of themeOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = selectedTheme === theme.id ? "theme-option active" : "theme-option";
    button.dataset.themeChoice = theme.id;
    button.innerHTML = `
      <span class="theme-swatch" aria-hidden="true"><span></span><span></span><span></span></span>
      <strong>${escapeHtml(theme.name)}</strong>
      <small>${escapeHtml(theme.detail)}</small>
    `;
    button.addEventListener("click", () => {
      applyTheme(theme.id);
      addStatus(`テーマを ${theme.name} に切り替えました。`);
      showSettings();
    });
    options.appendChild(button);
  }
  group.appendChild(options);
  artifactList.appendChild(group);
}

async function showModels() {
  clearPanel("モデル");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/models");
    artifactList.replaceChildren();
    const models = result.data || [];
    for (const candidate of models.slice(0, 24)) {
      addPanelRow(candidate.displayName || candidate.model || candidate.id, candidate.defaultReasoningEffort || "", () => {
        selectedModel = candidate.model || candidate.id;
        selectedModelLabel = (candidate.displayName || selectedModel).replace(/^GPT-/, "").replace(/^gpt-/, "");
        localStorage.setItem("codexPhoneModel", selectedModel);
        localStorage.setItem("codexPhoneModelLabel", selectedModelLabel);
        updateModelButton();
        addStatus(`モデルを ${selectedModel} に設定しました。次の送信から反映します。`);
      });
    }
    if (!models.length) addPanelRow("モデル一覧を取得できませんでした");
  } catch (error) {
    showToolError("モデル", error);
  }
}

function renderWorkspaceEntries(entries) {
  artifactList.replaceChildren();
  artifactList.classList.add("artifact-browser-list");
  for (const entry of entries) {
    const icon = entry.type === "directory" ? "DIR" : entry.kind === "image" ? "IMG" : entry.kind === "markdown" ? "MD" : "FILE";
    const row = addPanelRow(entry.name || entry.path, entry.path, null, icon);
    row.classList.add("workspace-row");
    if (entry.type === "directory") {
      row.disabled = true;
      continue;
    }
    row.innerHTML += `
      <span class="row-actions" aria-hidden="true">
        <span>追加</span>
      </span>
    `;
    let clickTimer = null;
    row.addEventListener("click", (event) => {
      if (event.altKey || event.metaKey) {
        showArtifact(entry.path);
        return;
      }
      if (event.detail > 1) return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        appendToPrompt(`@${entry.path}`);
        addStatus(`${entry.path} をチャット入力へ追加しました。`);
      }, 220);
    });
    row.addEventListener("dblclick", () => {
      clearTimeout(clickTimer);
      showArtifact(entry.path);
    });
  }
  if (!entries.length) addPanelRow("ワークスペース内のファイルは見つかりませんでした", "検索条件を変えるか、リポジトリを確認してください");
}

async function showWorkspace() {
  clearPanel("ワークスペース", "workspace");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/workspace?limit=180");
    renderWorkspaceEntries(result.data || []);
  } catch (error) {
    showToolError("ワークスペース", error);
  }
}

function renderReview(result) {
  artifactList.replaceChildren();
  artifactList.classList.add("artifact-browser-list");
  addPanelRow("ブランチ", result.branch || "unknown", null, "G");
  addPanelRow(result.clean ? "変更なし" : `${result.files?.length || 0}件の変更`, result.clean ? "working tree clean" : "git status --short", null, "Δ");
  for (const statLine of result.stat || []) addPanelRow(statLine.trim(), "", null, "Σ");
  for (const file of result.files || []) {
    const row = addPanelRow(file.path, file.status, () => {
      if (file.openable) {
        showArtifact(file.path);
        return;
      }
      appendToPrompt(`レビュー対象: ${file.path}`);
      addStatus(`${file.path} をレビュー対象として入力に追加しました。`);
    }, file.status || "MOD");
    row.classList.add("review-row");
    row.innerHTML += `<span class="row-diff-stat">${diffStatLabel(file)}</span>`;
  }
}

async function showReview() {
  clearPanel("レビュー", "review");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/review");
    renderReview(result);
  } catch (error) {
    showToolError("レビュー", error);
  }
}

async function showSlashCommands() {
  clearPanel("スラッシュコマンド", "sources");
  addPanelRow("読み込み中...");
  try {
    const commands = await slashCommands();
    artifactList.replaceChildren();
    for (const command of commands) {
      addPanelRow(command.usage || `/${command.name}`, command.description || command.kind || "", () => {
        const runnable = runnableSlashText(command);
        promptInput.value = runnable;
        promptInput.setSelectionRange(runnable.length, runnable.length);
        promptInput.focus();
        closeSlashSuggestions();
      }, command.kind === "client" ? "UI" : command.kind === "shell" ? "$" : "/");
    }
    if (!commands.length) addPanelRow("スラッシュコマンドは見つかりませんでした");
  } catch (error) {
    showToolError("スラッシュコマンド", error);
  }
}

function showSources() {
  clearPanel("情報源", "sources");
  addPanelRow("Web調査を入力へ追加", "外部確認が必要なターンで使う", () => {
    appendToPrompt("Web調査を使って確認してください。");
    addStatus("Web調査指示をチャット入力へ追加しました。");
  }, "WEB");
  addPanelRow("スキル", "利用可能な skill を入力へ追加", showSkills, "SK");
  addPanelRow("スラッシュコマンド", "/compact、/diff、/review など", showSlashCommands, "/");
  addPanelRow("ローカルファイル", "Filesタブから @path を追加できます", showWorkspace, "FILE");
  addPanelRow("フォルダを選んで新しいチャット", "home 配下のフォルダだけ表示", () => showFolderBrowser(currentWorkdir || ""), "DIR");
  addPanelRow("差分レビュー", "Diffタブから変更ファイルを追加できます", showReview, "DIFF");
}

function startVoiceInput() {
  voiceButton.dataset.voiceState = "requested";
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.dataset.voiceState = "unsupported";
    addStatus("このブラウザでは音声入力APIが使えません。");
    promptInput.focus();
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = document.documentElement.lang || "ja-JP";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  voiceButton.classList.add("listening");
  addStatus("音声入力を開始しました。ブラウザのマイク許可を確認してください。");
  recognition.addEventListener("result", (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    if (!transcript) return;
    promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}${transcript}`;
    promptInput.focus();
    addStatus("音声入力をテキストへ追加しました。");
  });
  recognition.addEventListener("error", (event) => addStatus(`音声入力に失敗しました: ${event.error || "unknown"}`));
  recognition.addEventListener("end", () => voiceButton.classList.remove("listening"));
  recognition.start();
}

async function showStatus() {
  clearPanel("バックグラウンド", "status");
  try {
    const result = await apiGet("/api/status?refreshRateLimits=1");
    setWorkspaceMeta(result);
    addPanelRow("Provider", result.provider || activeProvider);
    addPanelRow("UI port", String(result.uiPort));
    addPanelRow("Codex app-server", result.codexUrl || "未使用");
    addRateLimitPanelRows(result.rateLimits || null);
    addPanelRow("履歴同期", result.historySyncEnabled ? "有効" : "無効");
    addPanelRow("リポジトリ", result.repoName || "");
    addPanelRow("現在地", result.workspaceLocation || result.workdir || "");
    addPanelRow("Git ブランチ", result.gitBranch || "不明");
    addPanelRow("作業ディレクトリ", result.workdir);
    for (const bridge of result.bridges || []) {
      addPanelRow(bridge.threadId || "thread準備中", `${bridge.clients}端末 / ${bridge.ready ? "ready" : "starting"}`);
    }
  } catch (error) {
    showToolError("バックグラウンド", error);
  }
}

async function showArtifact(path) {
  const shouldFocusPanel = window.matchMedia("(max-width: 1100px)").matches;
  showRightPanel();
  setActivePanel("artifacts");
  artifactTitle.textContent = "アーティファクト";
  artifactList.classList.add("artifact-browser-list");
  activeArtifactPath = path;
  renderArtifactRows();
  artifactPreview.className = "artifact-preview";
  artifactPreview.innerHTML = `
    <div class="artifact-preview-header">
      <div class="artifact-preview-title">${escapeHtml(path)}</div>
      <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
    </div>
    <p>読み込み中...</p>
  `;
  if (shouldFocusPanel) syncRightPanelState({ focus: true });
  try {
    const result = await apiGet(`/api/file?path=${encodeURIComponent(path)}`);
    setArtifactPreview(result);
    artifactPreview.classList.remove("hidden");
  } catch (error) {
    artifactPreview.innerHTML = `
      <div class="artifact-preview-header">
        <div class="artifact-preview-title">${escapeHtml(path)}</div>
        <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
      </div>
      <p>読み込みに失敗しました: ${escapeHtml(error.message)}</p>
    `;
    addEntry("error", `アーティファクト: ${error.message}`);
  }
}

function setArtifactPreview(result) {
  const isImage = result.kind === "image";
  const isMarkdown = result.kind === "markdown" || /\.md(?:own)?$/i.test(result.path);
  artifactPreview.classList.toggle("image-artifact-preview", isImage);
  artifactPreview.classList.toggle("markdown-preview", isMarkdown);
  artifactPreview.classList.toggle("plain-preview", !isMarkdown && !isImage);
  const header = `
    <div class="artifact-preview-header">
      <div class="artifact-preview-title">${escapeHtml(result.path)}</div>
      <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
    </div>
  `;
  if (isImage) {
    artifactPreview.innerHTML = header;
    const gallery = renderImageGallery([{ name: result.path, url: result.imageUrl }]);
    artifactPreview.appendChild(gallery);
    return;
  }
  artifactPreview.innerHTML = `${header}${
    isMarkdown ? renderMarkdown(result.text, { allowHtml: true, headingOffset: 0 }) : `<pre><code>${escapeHtml(result.text)}</code></pre>`
  }`;
}

function renderAttachments() {
  attachments.replaceChildren();
  attachments.classList.toggle("has-attachments", pendingFiles.length > 0);
  for (const file of pendingFiles) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "attachment-chip";
    chip.setAttribute("aria-label", `${file.name} の添付を削除`);
    const thumb = document.createElement("img");
    thumb.src = file.dataUrl;
    thumb.alt = "";
    const label = document.createElement("span");
    label.textContent = file.name;
    const close = document.createElement("span");
    close.textContent = "×";
    chip.append(thumb, label, close);
    chip.addEventListener("click", () => {
      pendingFiles = pendingFiles.filter((candidate) => candidate !== file);
      renderAttachments();
    });
    attachments.appendChild(chip);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setPanelWidth(kind, width) {
  const config = panelWidthConfig[kind];
  if (!config) return width;
  const next = clampNumber(width, config.min, config.max);
  const rootStyle = document.documentElement.style;
  const handle = kind === "left" ? leftResizeHandle : rightResizeHandle;
  rootStyle.setProperty(config.cssVar, `${next}px`);
  localStorage.setItem(config.storageKey, String(next));
  handle?.setAttribute("aria-valuenow", String(next));
  return next;
}

function loadPanelWidths() {
  for (const kind of ["left", "right"]) {
    const config = panelWidthConfig[kind];
    const handle = kind === "left" ? leftResizeHandle : rightResizeHandle;
    const savedWidth = Number(localStorage.getItem(config.storageKey));
    if (savedWidth) setPanelWidth(kind, savedWidth);
    handle?.setAttribute("aria-valuemin", String(config.min));
    handle?.setAttribute("aria-valuemax", String(config.max));
  }
}

function bindResizeHandle(handle, kind) {
  if (!handle) return;
  let drag = null;
  const currentWidth = () => {
    const value =
      kind === "left"
        ? getComputedStyle(document.documentElement).getPropertyValue(panelWidthConfig.left.cssVar)
        : getComputedStyle(document.documentElement).getPropertyValue(panelWidthConfig.right.cssVar);
    return Number.parseFloat(value) || panelWidthConfig[kind].fallback;
  };

  handle.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 820px)").matches) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: currentWidth() };
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-sidebar");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = event.clientX - drag.startX;
    setPanelWidth(kind, kind === "left" ? drag.startWidth + delta : drag.startWidth - delta);
  });

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    document.body.classList.remove("resizing-sidebar");
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    if (event.key === "Home") setPanelWidth(kind, panelWidthConfig[kind].min);
    else if (event.key === "End") setPanelWidth(kind, panelWidthConfig[kind].max);
    else {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setPanelWidth(kind, currentWidth() + (kind === "left" ? direction : -direction) * step);
    }
  });
}

function connect() {
  if (tokenRequired && !token) {
    addEntry("error", "URLに token がありません。Mac側に表示されたURLをそのまま開いてください。");
    return;
  }
  if (currentThreadProvider() !== activeProvider) {
    if (ws) ws.close();
    setReady(false);
    meta.textContent = `${providerLabel(currentThreadProvider())} は ${providerLabel(activeProvider)} bridge では開けません`;
    setRunState("disconnected", "Providerが違います");
    return;
  }
  if (ws) ws.close();
  liveTurnActive = false;
  setRunState("connecting");
  prepareThreadHistoryForConnect(selectedThread);
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  threadTitle.textContent = selected ? titleForThread(selected) : "新しい共有thread";
  if (selectedThread) refreshSelectedThread();

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const query = new URLSearchParams();
  if (tokenRequired && token) query.set("token", token);
  if (selectedThread) query.set("thread", selectedThread);
  if (!selectedThread) {
    if (nextThreadCwd) query.set("cwd", nextThreadCwd);
    if (forceNewThreadOnce) query.set("new", "1");
  }
  forceNewThreadOnce = false;
  nextThreadCwd = "";
  const bridgeQuery = query.toString();
  const socket = new WebSocket(`${proto}//${location.host}/bridge${bridgeQuery ? `?${bridgeQuery}` : ""}`);
  ws = socket;
  connectButton.disabled = true;
  meta.textContent = "接続中";

  socket.addEventListener("open", (event) => {
    if (event.currentTarget !== ws) return;
    setRunState("connecting", "Codex に接続中");
    addEntry("status", "Macの共有ブリッジへ接続しました。");
  });

  socket.addEventListener("message", (event) => {
    if (event.currentTarget !== ws) return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      setRunState("error", "bridge応答を読み取れません");
      addEntry("error", "bridge応答を読み取れません。再接続してください。");
      return;
    }
    if (msg.type === "ready") {
      setReady(true);
      setCurrentWorkdir(msg.workdir);
      setWorkspaceMeta(msg);
      setActiveProvider(msg.provider || activeProvider);
      if (msg.model) {
        selectedModelLabel = msg.model.replace(/^gpt-/i, "").replace(/^claude-/i, "");
        if (activeProvider === "codex") selectedModelLabel = selectedModelLabel.toUpperCase();
        updateModelButton();
      }
      const readyThreadId = msg.threadId || selectedThread;
      incrementThreadReadyNonce(readyThreadId);
      syncReadyThread(msg.threadId);
      renderHistoryIfChanged(msg.history || [], { threadId: readyThreadId });
      meta.textContent = `${msg.model}  •  ${msg.clients}端末  •  ${msg.workdir}`;
      setRunState(msg.run?.state || "ready", msg.run?.label);
      if (Array.isArray(msg.pendingApprovals) && msg.pendingApprovals.length) {
        showPendingApproval(msg.pendingApprovals[0]);
      }
      addEntry("status", `共有${providerLabel(msg.provider || "codex")} thread ready: ${msg.threadId}`);
      return;
    }
    if (msg.type === "user") {
      liveTurnActive = true;
      assistantEntry = null;
      setRunState("running");
      addEntry("user", msg.text, msg.attachments || []);
      return;
    }
    if (msg.type === "assistantDelta") {
      setRunState("streaming");
      if (!assistantEntry) assistantEntry = addEntry("assistant", "");
      setEntryText(assistantEntry, "assistant", `${assistantEntry.markdownSource || ""}${msg.text}`);
      log.scrollTop = log.scrollHeight;
      return;
    }
    if (msg.type === "approval") {
      showPendingApproval(msg.approval || msg.request);
      return;
    }
    if (msg.type === "approvalResolved") {
      if (!pendingApproval || pendingApproval.approvalId === msg.approvalId) {
        pendingApproval = null;
        approval.classList.add("hidden");
      }
      return;
    }
    if (msg.type === "runState") {
      setRunState(msg.run?.state || "ready", msg.run?.label);
      return;
    }
    if (msg.type === "turn" && msg.status === "completed") {
      liveTurnActive = false;
      lastHistorySignature = "";
      assistantEntry = null;
      setRunState(msg.run?.state || "done", msg.run?.label || "完了しました");
      loadThreads();
      refreshSelectedThread();
      appendReviewDigest();
      return;
    }
    if (msg.type === "turn" && msg.status === "interrupted") {
      liveTurnActive = false;
      assistantEntry = null;
      pendingApproval = null;
      approval.classList.add("hidden");
      setRunState("error", msg.reason || "処理が中断されました");
      return;
    }
    if (msg.type === "error") {
      if (recoverMissingSelectedThread(msg.text)) return;
      const problem = normalizeUiError(msg.text || msg);
      setRunState(problem.state, problem.text);
      addEntry(problem.kind, problem.text);
      if (problem.detail && problem.detail !== problem.text) console.warn("Codex bridge error details", problem.detail);
      return;
    }
    if (msg.type === "status") {
      if (/履歴同期を更新しました/.test(msg.text || "")) setRunState("done", "完了・履歴同期済み");
      else if (/履歴同期に失敗/.test(msg.text || "")) setRunState("error", "履歴同期に失敗");
      else if (/履歴同期/.test(msg.text || "")) setRunState("syncing", msg.text);
      addEntry("status", msg.text);
    }
  });

  socket.addEventListener("close", (event) => {
    if (event.currentTarget !== ws) return;
    setReady(false);
    interruptRequestPending = false;
    updateInterruptButton();
    connectButton.disabled = false;
    meta.textContent = "切断";
    setRunState("disconnected");
  });
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if ((!text && !pendingFiles.length) || !ws || ws.readyState !== WebSocket.OPEN) return;
  const slash = parseSlashInput(text);
  if (slash && !pendingFiles.length) {
    if (handleClientSlashCommand(slash)) {
      promptInput.value = "";
      closeSlashSuggestions();
      return;
    }
    ws.send(
      JSON.stringify({
        type: "slashCommand",
        token,
        text,
        options: {
          model: selectedModel || undefined,
          approvalPolicy: accessMode.approvalPolicy,
          sandboxMode: accessMode.sandboxMode,
        },
      }),
    );
    promptInput.value = "";
    closeSlashSuggestions();
    return;
  }
  ws.send(
    JSON.stringify({
      type: "prompt",
      token,
      text: text || "添付画像を確認してください。",
      attachments: pendingFiles,
      options: {
        model: selectedModel || undefined,
        approvalPolicy: accessMode.approvalPolicy,
        sandboxMode: accessMode.sandboxMode,
      },
    }),
  );
  promptInput.value = "";
  closeSlashSuggestions();
  pendingFiles = [];
  renderAttachments();
});

promptInput.addEventListener("input", () => updateSlashSkillMenu());
promptInput.addEventListener("click", () => updateSlashSkillMenu());
promptInput.addEventListener("compositionend", () => updateSlashSkillMenu());
promptInput.addEventListener("keydown", (event) => {
  if (!slashSkillMenu || slashSkillMenu.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    hideSlashSkillMenu();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveSlashSelection(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    const rows = slashMenuRows();
    if (!rows.length) return;
    event.preventDefault();
    const skill = filterSlashSkills(activeSlashMatch?.query || "")[slashActiveIndex];
    if (skill) selectSlashSkill(skill);
  }
});

interruptButton?.addEventListener("click", () => {
  if (!interruptibleRunStates.has(currentRunState) || interruptRequestPending) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addStatus("未接続のため中断要求を送信できません。");
    return;
  }
  interruptRequestPending = true;
  pendingApproval = null;
  approval.classList.add("hidden");
  setRunState("interrupting", "中断要求を送信中");
  try {
    ws.send(JSON.stringify({ type: "interrupt", token }));
  } catch (error) {
    interruptRequestPending = false;
    updateInterruptButton();
    addEntry("error", `中断要求の送信に失敗しました: ${error.message}`);
  }
});

approveButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "accept", approvalId: pendingApproval.approvalId, request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
  setRunState("running", "承認済み・処理中");
});

declineButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "decline", approvalId: pendingApproval.approvalId, request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
  setRunState("running", "拒否済み・処理中");
});

newThreadButton.addEventListener("click", () => selectThread(""));
searchButton.addEventListener("click", () => {
  threadSearch.classList.toggle("hidden");
  threadSearch.focus();
  renderThreadList();
  openSidebar();
});
threadSearch.addEventListener("input", renderThreadList);
promptInput.addEventListener("input", updateSlashSuggestions);
promptInput.addEventListener("blur", () => setTimeout(closeSlashSuggestions, 120));
pluginsButton.addEventListener("click", showPlugins);
automationsButton.addEventListener("click", showAutomations);
settingsButton.addEventListener("click", showSettings);
mobileThreadsButton.addEventListener("click", () => {
  if (document.body.classList.contains("show-sidebar")) closeSidebar({ restoreFocus: true });
  else openSidebar({ focus: true });
});
sidebarScrim.addEventListener("click", () => closeSidebar({ restoreFocus: true }));
connectButton.addEventListener("click", connect);
menuButton.addEventListener("click", () => {
  const desktopPanelVisible =
    window.matchMedia("(min-width: 1101px)").matches && !document.body.classList.contains("hide-artifacts");
  const mobilePanelVisible = document.body.classList.contains("show-panel");
  if (desktopPanelVisible || mobilePanelVisible) {
    closeRightPanel({ restoreFocus: true });
    addStatus("右パネルを閉じました。");
  } else {
    showRightPanel({ focus: window.matchMedia("(max-width: 1100px)").matches });
    addStatus("右パネルを開きました。");
  }
});
closePanelButton.addEventListener("click", () => closeRightPanel({ restoreFocus: true }));
artifactPreview.addEventListener("click", (event) => {
  if (closestElement(event.target, "[data-preview-close]")) hideArtifactPreview();
});
addButton.addEventListener("click", () => fileInput.click());
expandPromptButton?.addEventListener("click", openPromptModal);
closePromptModalButton?.addEventListener("click", () => closePromptModal({ apply: true }));
cancelPromptModalButton?.addEventListener("click", () => closePromptModal({ apply: false }));
applyPromptModalButton?.addEventListener("click", () => closePromptModal({ apply: true }));
promptModal?.addEventListener("click", (event) => {
  if (event.target === promptModal) closePromptModal({ apply: true });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && promptModal && !promptModal.classList.contains("hidden")) {
    closePromptModal({ apply: true });
  }
});
fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []).filter((file) => file.type.startsWith("image/"));
  try {
    pendingFiles = pendingFiles.concat(await Promise.all(files.map(readFileAsDataUrl)));
    renderAttachments();
    if (files.length) addStatus(`${files.length}件の画像を添付しました。送信時にCodexへ渡します。`);
  } catch (error) {
    addEntry("error", `添付に失敗しました: ${error.message}`);
  } finally {
    fileInput.value = "";
  }
});
accessButton.addEventListener("click", () => {
  const index = accessModes.findIndex((candidate) => candidate.label === accessMode.label);
  accessMode = accessModes[(index + 1) % accessModes.length];
  setAccessButtonLabel();
  addStatus(`権限を ${accessMode.label} に切り替えました。次の送信から反映します。`);
});
modelButton.addEventListener("click", toggleModelMenu);
voiceButton.addEventListener("click", startVoiceInput);
modelMenu.addEventListener("click", (event) => {
  const reasoningRow = closestElement(event.target, "[data-reasoning]");
  if (reasoningRow) {
    selectReasoning(reasoningRow.dataset.reasoning);
    return;
  }
  const modelRow = closestElement(event.target, "[data-model-choice]");
  if (modelRow) {
    selectModel(modelRow.dataset.modelChoice);
    return;
  }
  if (closestElement(event.target, "#moreModelsButton")) {
    closeModelMenu();
    showModels();
  }
});
document.addEventListener("click", async (event) => {
  if (handleArtifactOpenEvent(event)) return;

  const button = closestElement(event.target, "[data-message-action='copy']");
  if (!button) return;
  const entry = button.closest(".entry");
  const body = entry?.querySelector(".entry-body");
  const text = body?.markdownSource || body?.innerText || "";
  if (!text.trim()) return;
  if (!navigator.clipboard?.writeText) {
    appendToPrompt(text);
    addStatus("クリップボードを利用できないため、入力欄へ追加しました。");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    addStatus("メッセージをコピーしました。");
  } catch {
    appendToPrompt(text);
    addStatus("クリップボードに書き込めないため、入力欄へ追加しました。");
  }
});
document.addEventListener("click", (event) => {
  if (modelMenu.classList.contains("hidden")) return;
  if (modelMenu.contains(event.target) || modelButton.contains(event.target)) return;
  closeModelMenu();
});
document.addEventListener("keydown", (event) => {
  if (modelMenu.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    closeModelMenu();
    modelButton.focus();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const rows = Array.from(modelMenu.querySelectorAll(".model-menu-row"));
  const current = rows.indexOf(document.activeElement);
  let next = current;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = rows.length - 1;
  else if (event.key === "ArrowDown") next = current < rows.length - 1 ? current + 1 : 0;
  else if (event.key === "ArrowUp") next = current > 0 ? current - 1 : rows.length - 1;
  rows[next]?.focus();
});
document.addEventListener("click", (event) => {
  if (!document.body.classList.contains("show-panel")) return;
  if (window.matchMedia("(min-width: 1101px)").matches) return;
  if (closestElement(event.target, "[data-open-artifact-path]")) return;
  if (artifactPanel.contains(event.target) || menuButton.contains(event.target)) return;
  closeRightPanel({ restoreFocus: true });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.body.classList.contains("show-panel")) {
    closeRightPanel({ restoreFocus: true });
    return;
  }
  if (document.body.classList.contains("show-sidebar")) {
    closeSidebar({ restoreFocus: true });
  }
});
statusButton.addEventListener("click", showStatus);
artifactTab?.addEventListener("click", () => renderArtifactIndex(artifactItems));
workspaceTab?.addEventListener("click", showWorkspace);
reviewTab?.addEventListener("click", showReview);
webSearchButton.addEventListener("click", showSources);
for (const button of artifactButtons) {
  button.addEventListener("click", () => {
    for (const candidate of artifactButtons) candidate.classList.toggle("active", candidate === button);
    showArtifact(button.dataset.artifact);
  });
}

setReady(false);
setAccessButtonLabel();
updateModelButton();
modelButton.setAttribute("aria-haspopup", "menu");
modelButton.setAttribute("aria-expanded", "false");
loadPanelWidths();
bindResizeHandle(leftResizeHandle, "left");
bindResizeHandle(rightResizeHandle, "right");
syncSidebarState();
syncRightPanelState();
loadBridgeInfo()
  .then(() => loadArtifacts())
  .then(() => loadThreads().catch(() => {}))
  .then(connect)
  .catch(() => {
    setRunState("error", "bridge情報を確認できません");
  });
setInterval(() => loadThreads({ background: true }), 10_000);
setInterval(refreshSelectedThread, 3_000);
