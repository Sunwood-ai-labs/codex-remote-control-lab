const log = document.querySelector("#log");
const meta = document.querySelector("#meta");
const headerCwd = document.querySelector("#headerCwd");
const pathbarColorPicker = document.querySelector("#pathbarColorPicker");
const connectButton = document.querySelector("#connect");
const newThreadButton = document.querySelector("#newThread");
const searchButton = document.querySelector("#searchButton");
const pluginsButton = document.querySelector("#pluginsButton");
const automationsButton = document.querySelector("#automationsButton");
const settingsButton = document.querySelector("#settingsButton");
const menuButton = document.querySelector("#menuButton");
const modeButtons = document.querySelectorAll("[data-main-mode]");
const terminalStatus = document.querySelector("#terminalStatus");
const terminalSessionMeta = document.querySelector("#terminalSessionMeta");
const terminalHost = document.querySelector("#terminalHost");
const terminalFallback = document.querySelector("#terminalFallback");
const terminalReconnect = document.querySelector("#terminalReconnect");
const terminalThemeToggle = document.querySelector("#terminalThemeToggle");
const terminalZoomOut = document.querySelector("#terminalZoomOut");
const terminalZoomIn = document.querySelector("#terminalZoomIn");
const terminalFontSizeLabel = document.querySelector("#terminalFontSizeLabel");
const terminalInputArea = document.querySelector("#terminalInputArea");
const terminalPrompt = document.querySelector("#terminalPrompt");
const terminalSend = document.querySelector("#terminalSend");
const terminalModeButtons = document.querySelectorAll("[data-terminal-input-mode]");
const terminalPanels = document.querySelectorAll("[data-terminal-panel]");
const terminalNativeInputButtons = document.querySelectorAll("[data-terminal-pty-input]");
const terminalActionButtons = document.querySelectorAll("[data-terminal-action]");
const terminalCtrlCButton = document.querySelector("[data-terminal-ctrl-c]");
const terminalCtrlCConfirm = document.querySelector("#terminalCtrlCConfirm");
const terminalCtrlCCancel = document.querySelector("#terminalCtrlCCancel");
const terminalCtrlCConfirmButton = document.querySelector("#terminalCtrlCConfirmButton");
const terminalFileInput = document.querySelector("#terminalFileInput");
const closePanelButton = document.querySelector("#closePanelButton");
const addButton = document.querySelector("#addButton");
const accessButton = document.querySelector("#accessButton");
const modelButton = document.querySelector("#modelButton");
const modelMenu = document.querySelector("#modelMenu");
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
const sessionSwitcher = document.querySelector("#sessionSwitcher");
const sessionCountPill = document.querySelector("#sessionCountPill");
const sessionCreatePage = document.querySelector("#sessionCreatePage");
const sessionCreateCancel = document.querySelector("#sessionCreateCancel");
const sessionSelectedCwd = document.querySelector("#sessionSelectedCwd");
const sessionRecentList = document.querySelector("#sessionRecentList");
const sessionRecentClear = document.querySelector("#sessionRecentClear");
const sessionBrowserUp = document.querySelector("#sessionBrowserUp");
const sessionBrowserPath = document.querySelector("#sessionBrowserPath");
const sessionBrowserList = document.querySelector("#sessionBrowserList");
const sessionDirectorySearch = document.querySelector("#sessionDirectorySearch");
const sessionStartButton = document.querySelector("#sessionStartButton");
const sessionHiddenToggle = document.querySelector("#sessionHiddenToggle");
const sessionSwitcherOverlay = document.querySelector("#sessionSwitcherOverlay");
const sessionSwitcherClose = document.querySelector("#sessionSwitcherClose");
const sessionSwitcherNew = document.querySelector("#sessionSwitcherNew");
const openSessionList = document.querySelector("#openSessionList");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#send");
const approval = document.querySelector("#approval");
const approvalText = document.querySelector("#approvalText");
const approveButton = document.querySelector("#approve");
const declineButton = document.querySelector("#decline");
const leftResizeHandle = document.querySelector("#leftResizeHandle");
const rightResizeHandle = document.querySelector("#rightResizeHandle");

const params = new URLSearchParams(location.search);
const token = params.get("token") || localStorage.getItem("codexPhoneToken") || "";
let selectedThread = params.get("thread") || "";
let tokenRequired = true;
let authMode = "token";
if (token) localStorage.setItem("codexPhoneToken", token);
if (params.has("token") && window.history?.replaceState) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete("token");
  window.history.replaceState({}, document.title, cleanUrl);
}

const viewportMeta = document.querySelector('meta[name="viewport"]');
const stableViewportContent = viewportMeta?.getAttribute("content") || "width=device-width, initial-scale=1, viewport-fit=cover";
const resetViewportContent = stableViewportContent.includes("maximum-scale=1")
  ? stableViewportContent
  : `${stableViewportContent}, maximum-scale=1`;

function isTextInputElement(element) {
  if (!element) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(element.type);
}

function resetViewportScaleAfterInput() {
  if (!viewportMeta || !window.visualViewport || window.visualViewport.scale <= 1.01) return;
  // iOS Safari は入力後の拡大状態を戻せないことがあるため、短時間だけ最大倍率を固定してから正規設定へ戻す。
  viewportMeta.setAttribute("content", resetViewportContent);
  requestAnimationFrame(() => {
    window.scrollTo(window.scrollX, window.scrollY);
    setTimeout(() => viewportMeta.setAttribute("content", stableViewportContent), 260);
  });
}

document.addEventListener(
  "focusout",
  (event) => {
    if (isTextInputElement(event.target)) resetViewportScaleAfterInput();
  },
  true,
);
window.addEventListener("orientationchange", () => setTimeout(resetViewportScaleAfterInput, 280));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resetViewportScaleAfterInput();
});

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
let remoteSessionState = null;
let lastHistorySignature = "";
let lastThreadListError = "";
let lastThreadRefreshError = "";
let selectedThreadRefreshActive = false;
let selectedModel = localStorage.getItem("codexPhoneModel") || "";
let selectedModelLabel = localStorage.getItem("codexPhoneModelLabel") || "5.5";
let selectedReasoning = localStorage.getItem("codexPhoneReasoning") || "中";
let activeMainMode = localStorage.getItem("codexMainMode") || "chat";
let nativeTerminal = null;
let terminalLongPressActive = false;
const terminalFontSizes = [5, 6, 7, 8, 10, 12, 14, 16];
let terminalFontSize = Number(localStorage.getItem("codexTerminalFontSize")) || 6;
if (!terminalFontSizes.includes(terminalFontSize)) terminalFontSize = 6;
let terminalThemeMode = localStorage.getItem("codexTerminalThemeMode") === "light" ? "light" : "dark";
let terminalInputMode = localStorage.getItem("codexTerminalInputMode") === "keys" ? "keys" : "text";
let terminalCopyFallbackDialog = null;
let settingsRenderSeq = 0;
let artifactItems = [];
let activeArtifactPath = "";
let activePanel = "artifacts";
let currentWorkdir = "";
let nextThreadCwd = "";
let forceNewThreadOnce = false;
const openSessionsStorageKey = "codexRemoteOpenSessions";
const activeSessionStorageKey = "codexRemoteLastActiveSessionKey";
const resumeSessionStorageKey = "codexRemoteResumeSession";
const cwdHistoryStorageKey = "codexRemoteCwdHistory";
const closedThreadIdsStorageKey = "codexRemoteClosedThreadIds";
const maxCwdHistory = 8;
let openSessions = readOpenSessions();
let activeSessionKey = localStorage.getItem(activeSessionStorageKey) || "";
let resumeCandidateSession = readResumeSession();
let cwdHistory = readCwdHistory();
let closedThreadIds = readClosedThreadIds();
let sessionCreateCwd = localStorage.getItem("codexRemoteLastCwd") || "";
let sessionBrowserCurrentPath = sessionCreateCwd || "";
let sessionBrowserParentPath = "";
let sessionShowHidden = false;
let sessionBrowserEntries = [];
const pathbarColorStorageKey = "codexPathbarColorsByCwd";
const defaultPathbarColor = "#8ba1c0";
let pathbarColorsByCwd = readPathbarColors();
let accessMode = {
  label: "フルアクセス",
  approvalPolicy: "never",
  sandboxMode: "danger-full-access",
};
let pendingFiles = [];

const panelWidthConfig = {
  left: { min: 188, max: 360, fallback: 232, storageKey: "codexLeftSidebarWidth", cssVar: "--thread-width" },
  right: { min: 280, max: 760, fallback: 420, storageKey: "codexRightSidebarWidth", cssVar: "--dock-width" },
};

const runStateText = {
  connecting: "接続中",
  ready: "待機中",
  running: "Codex 処理中",
  streaming: "回答生成中",
  approval: "承認待ち",
  syncing: "履歴同期中",
  done: "完了",
  disconnected: "切断",
  error: "エラー",
};

function isRemoteSessionRunning() {
  return remoteSessionState?.status === "running";
}

function setRunState(state, label) {
  if (!runState || !runStateLabel) return;
  const nextLabel = label || runStateText[state] || state;
  if (runState.dataset.state === state && runStateLabel.textContent === nextLabel) return;
  runState.dataset.state = state;
  runStateLabel.textContent = nextLabel;
}

function applyRemoteSessionState(state) {
  if (!state || typeof state !== "object") return;
  remoteSessionState = state;
  if (activeSessionKey) {
    const active = openSessions.find((session) => session.key === activeSessionKey);
    if (active) {
      active.status = state.status || active.status;
      active.updatedAt = Date.now();
      persistOpenSessions();
      renderSessionChrome();
    }
  }
  syncTerminalSessionMeta();
  if (state.status === "running") {
    liveTurnActive = true;
    setRunState("running", state.label || "Codex 処理中");
    return;
  }
  if (state.status === "awaiting_approval") {
    liveTurnActive = true;
    setRunState("approval", state.label || "承認待ち");
    return;
  }
  if (state.status === "input_ready" || state.status === "completed") {
    liveTurnActive = false;
    assistantEntry = null;
    setRunState("done", state.label || "入力待ち");
    loadThreads();
    refreshSelectedThread();
  }
}

function applyTheme(themeId) {
  const nextTheme = themeOptions.some((theme) => theme.id === themeId) ? themeId : "simple";
  selectedTheme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("codexPhoneTheme", nextTheme);
}

applyTheme(selectedTheme);

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function readPathbarColors() {
  try {
    const parsed = JSON.parse(localStorage.getItem(pathbarColorStorageKey) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pathbarColorKeyFor(cwd = currentWorkdir) {
  return cwd || "__default__";
}

function pathbarColorFor(cwd = currentWorkdir) {
  const saved = pathbarColorsByCwd[pathbarColorKeyFor(cwd)] || pathbarColorsByCwd.__default__;
  return isHexColor(saved) ? saved : defaultPathbarColor;
}

function applyPathbarColor(color = pathbarColorFor()) {
  const nextColor = isHexColor(color) ? color : defaultPathbarColor;
  document.documentElement.style.setProperty("--pathbar-color", nextColor);
  if (pathbarColorPicker) pathbarColorPicker.value = nextColor;
}

function savePathbarColorForCurrentWorkdir(color) {
  if (!isHexColor(color)) return;
  pathbarColorsByCwd[pathbarColorKeyFor()] = color;
  localStorage.setItem(pathbarColorStorageKey, JSON.stringify(pathbarColorsByCwd));
  applyPathbarColor(color);
}

applyPathbarColor();

function readJsonObjectArray(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

function readOpenSessions() {
  return readJsonObjectArray(openSessionsStorageKey)
    .map((item) => normalizeOpenSession(item))
    .filter(Boolean);
}

function readResumeSession() {
  try {
    return normalizeOpenSession(JSON.parse(localStorage.getItem(resumeSessionStorageKey) || "null"));
  } catch {
    return null;
  }
}

function readCwdHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(cwdHistoryStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, maxCwdHistory) : [];
  } catch {
    return [];
  }
}

function readClosedThreadIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(closedThreadIdsStorageKey) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function persistClosedThreadIds() {
  localStorage.setItem(closedThreadIdsStorageKey, JSON.stringify(Array.from(closedThreadIds)));
}

function rememberClosedThread(threadId) {
  const id = String(threadId || "");
  if (!id) return;
  closedThreadIds.add(id);
  persistClosedThreadIds();
}

function forgetClosedThread(threadId) {
  const id = String(threadId || "");
  if (!id || !closedThreadIds.delete(id)) return;
  persistClosedThreadIds();
}

function sessionKeyFor(threadId = "", cwd = "") {
  return `${threadId || "new"}::${cwd || ""}`;
}

function normalizeOpenSession(item) {
  if (!item || typeof item !== "object") return null;
  const threadId = String(item.threadId || "");
  const cwd = String(item.cwd || "");
  if (!threadId && !cwd) return null;
  return {
    key: String(item.key || sessionKeyFor(threadId, cwd)),
    threadId,
    cwd,
    title: String(item.title || threadId || cwd || "New session"),
    status: String(item.status || "ready"),
    updatedAt: Number(item.updatedAt || Date.now()),
  };
}

function persistOpenSessions() {
  localStorage.setItem(openSessionsStorageKey, JSON.stringify(openSessions));
  if (activeSessionKey) localStorage.setItem(activeSessionStorageKey, activeSessionKey);
  else localStorage.removeItem(activeSessionStorageKey);
}

function persistResumeSession(session) {
  const normalized = normalizeOpenSession(session);
  if (!normalized?.threadId) return;
  resumeCandidateSession = normalized;
  localStorage.setItem(resumeSessionStorageKey, JSON.stringify(normalized));
}

function pushCwdHistory(cwd) {
  const nextCwd = String(cwd || "").trim();
  if (!nextCwd) return;
  cwdHistory = [nextCwd, ...cwdHistory.filter((item) => item !== nextCwd)].slice(0, maxCwdHistory);
  localStorage.setItem(cwdHistoryStorageKey, JSON.stringify(cwdHistory));
  localStorage.setItem("codexRemoteLastCwd", nextCwd);
}

function shortSessionPath(cwd) {
  const display = displayPath(cwd);
  const parts = String(display || "").split("/").filter(Boolean);
  if (parts.length <= 2) return display || "cwd未設定";
  return `.../${parts.slice(-2).join("/")}`;
}

function basenameForPath(cwd) {
  const trimmed = String(cwd || "").replace(/\/+$/, "");
  const parts = trimmed.split("/").filter(Boolean);
  return parts.at(-1) || trimmed || "New session";
}

function homeDirectoryForPath(value) {
  const text = String(value || "");
  const match = text.match(/^\/Users\/[^/]+(?=\/|$)/) || text.match(/^\/home\/[^/]+(?=\/|$)/);
  return match?.[0] || "";
}

function displayPath(value) {
  const text = String(value || "");
  const home = homeDirectoryForPath(text);
  if (!home) return text;
  return text === home ? "~" : `~${text.slice(home.length)}`;
}

function defaultDeveloperPath() {
  const candidates = [sessionCreateCwd, sessionBrowserCurrentPath, currentWorkdir, ...cwdHistory].filter(Boolean);
  for (const candidate of candidates) {
    const text = String(candidate);
    const marker = "/Developer";
    const index = text.indexOf(marker);
    if (index >= 0) return text.slice(0, index + marker.length);
  }
  return "";
}

function addOrUpdateOpenSession(input) {
  const session = normalizeOpenSession({
    ...input,
    key: sessionKeyFor(input.threadId, input.cwd),
    title: input.title || basenameForPath(input.cwd) || input.threadId,
    updatedAt: Date.now(),
  });
  if (!session) return null;
  forgetClosedThread(session.threadId);
  const index = openSessions.findIndex((item) => item.key === session.key);
  if (index >= 0) openSessions[index] = { ...openSessions[index], ...session };
  else openSessions.push(session);
  activeSessionKey = session.key;
  persistResumeSession(session);
  persistOpenSessions();
  renderSessionChrome();
  return session;
}

function syncOpenSessionsFromThreads(threads = threadCache) {
  const liveIds = new Set(threads.map((thread) => thread.id).filter(Boolean));
  const previousActive =
    openSessions.find((session) => session.key === activeSessionKey && session.threadId) || resumeCandidateSession || readResumeSession();
  const known = new Map(openSessions.map((item) => [item.threadId, item]));
  for (const thread of threads) {
    if (!thread.id) continue;
    if (closedThreadIds.has(thread.id) && thread.id !== selectedThread) continue;
    const existing = known.get(thread.id);
    if (existing) {
      existing.cwd = thread.cwd || existing.cwd;
      existing.title = titleForThread(thread);
      existing.status = thread.status || thread.sessionState?.status || existing.status || "ready";
      existing.updatedAt = thread.updatedAt || thread.createdAt || Date.now();
      continue;
    }
    openSessions.push(
      normalizeOpenSession({
        threadId: thread.id,
        cwd: thread.cwd || "",
        title: titleForThread(thread),
        status: thread.status || thread.sessionState?.status || "ready",
        updatedAt: thread.updatedAt || thread.createdAt || Date.now(),
      }),
    );
  }
  openSessions = openSessions
    .filter((session) => session && (!session.threadId || (liveIds.has(session.threadId) && !closedThreadIds.has(session.threadId))))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  if (previousActive?.threadId && !liveIds.has(previousActive.threadId)) persistResumeSession(previousActive);
  if (selectedThread && !liveIds.has(selectedThread)) {
    persistResumeSession({
      threadId: selectedThread,
      cwd: currentWorkdir || previousActive?.cwd || resumeCandidateSession?.cwd || "",
      title: previousActive?.title || selectedThread,
      status: "resume_pending",
    });
  }
  if (!activeSessionKey && openSessions.length) activeSessionKey = openSessions[0].key;
  if (
    activeSessionKey &&
    !openSessions.some((session) => session.key === activeSessionKey) &&
    resumeCandidateSession?.key !== activeSessionKey
  ) {
    activeSessionKey = "";
  }
  persistOpenSessions();
  renderSessionChrome();
}

function mergeThreadRows(historyRows = [], liveRows = []) {
  const merged = new Map();
  for (const thread of historyRows) {
    if (thread?.id) merged.set(thread.id, thread);
  }
  for (const thread of liveRows) {
    if (!thread?.id) continue;
    const existing = merged.get(thread.id);
    if (existing) {
      merged.set(thread.id, {
        ...existing,
        cwd: existing.cwd || thread.cwd || "",
        ready: thread.ready,
        clients: thread.clients,
        status: thread.status,
        sessionState: thread.sessionState,
        source: thread.source || existing.source,
        live: true,
        updatedAt: Math.max(Number(existing.updatedAt || 0), Number(thread.updatedAt || 0)),
      });
    } else {
      merged.set(thread.id, { ...thread, live: true });
    }
  }
  return Array.from(merged.values()).sort((left, right) => {
    return Number(right.updatedAt || right.createdAt || 0) - Number(left.updatedAt || left.createdAt || 0);
  });
}

function activeSessionIndex() {
  return openSessions.findIndex((session) => session.key === activeSessionKey);
}

function switchToOpenSession(sessionKey) {
  const session = openSessions.find((item) => item.key === sessionKey);
  if (!session) return false;
  activeSessionKey = session.key;
  persistOpenSessions();
  selectedThread = session.threadId || "";
  currentWorkdir = session.cwd || currentWorkdir;
  updateUrlThread();
  renderSessionChrome();
  connect();
  return true;
}

function switchOpenSessionByOffset(offset) {
  if (openSessions.length < 2) return false;
  const current = Math.max(0, activeSessionIndex());
  const next = current + offset;
  if (next < 0 || next >= openSessions.length) return false;
  return switchToOpenSession(openSessions[next].key);
}

function removeOpenSession(sessionKey) {
  const index = openSessions.findIndex((session) => session.key === sessionKey);
  if (index < 0) return;
  const [removed] = openSessions.splice(index, 1);
  rememberClosedThread(removed?.threadId);
  if (removed?.threadId === selectedThread) {
    const neighbor = openSessions[index] || openSessions[Math.max(0, index - 1)] || null;
    activeSessionKey = neighbor?.key || "";
    selectedThread = neighbor?.threadId || "";
    currentWorkdir = neighbor?.cwd || currentWorkdir;
    updateUrlThread();
    if (neighbor) connect();
    else renderHistory([]);
  }
  persistOpenSessions();
  renderSessionChrome();
  renderOpenSessionList();
}

function renderSessionChrome() {
  const index = activeSessionIndex();
  if (sessionCountPill) sessionCountPill.textContent = openSessions.length ? `${Math.max(0, index) + 1}/${openSessions.length}` : "0/0";
  renderOpenSessionList();
}

function renderOpenSessionList() {
  if (!openSessionList) return;
  openSessionList.replaceChildren();
  if (!openSessions.length) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = "開いているセッションはありません。";
    openSessionList.appendChild(empty);
    return;
  }
  for (const session of openSessions) {
    const row = document.createElement("div");
    row.className = session.key === activeSessionKey ? "session-card-row active" : "session-card-row";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "session-card";
    card.innerHTML = `
      <span class="session-card-icon open-session-icon" aria-hidden="true">${fontAwesomeIcon("folder", "project-icon")}</span>
      <span class="session-card-main">
        <span class="session-card-title">${escapeHtml(session.title || basenameForPath(session.cwd))}</span>
        <span class="session-card-path">${escapeHtml(displayPath(session.cwd) || "cwd未設定")}</span>
        <span class="session-card-meta">${escapeHtml(session.status || "ready")} · ${escapeHtml(shortSessionPath(session.cwd))}</span>
      </span>
    `;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "session-card-close";
    close.setAttribute("aria-label", `${session.title || session.threadId} を閉じる`);
    close.textContent = "×";
    card.addEventListener("click", () => {
      closeSessionSwitcher();
      switchToOpenSession(session.key);
    });
    close.addEventListener("click", () => removeOpenSession(session.key));
    row.append(card, close);
    openSessionList.appendChild(row);
  }
}

function openSessionSwitcher() {
  renderOpenSessionList();
  sessionSwitcherOverlay?.classList.remove("hidden");
}

function closeSessionSwitcher() {
  sessionSwitcherOverlay?.classList.add("hidden");
}

function restoreActiveSessionFromStorage() {
  if (selectedThread) return true;
  const liveIds = new Set(threadCache.map((thread) => thread.id).filter(Boolean));
  const saved =
    openSessions.find((session) => session.key === activeSessionKey && liveIds.has(session.threadId)) ||
    openSessions.find((session) => liveIds.has(session.threadId)) ||
    resumeCandidateSession ||
    readResumeSession() ||
    null;
  if (!saved) return false;
  activeSessionKey = saved.key;
  selectedThread = saved.threadId || "";
  currentWorkdir = saved.cwd || currentWorkdir;
  updateUrlThread();
  renderSessionChrome();
  return Boolean(selectedThread);
}

function setMainMode(mode) {
  const nextMode = mode === "terminal" ? "terminal" : "chat";
  activeMainMode = nextMode;
  document.body.dataset.mainMode = nextMode;
  localStorage.setItem("codexMainMode", nextMode);
  for (const button of modeButtons) {
    const active = button.dataset.mainMode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (nextMode === "terminal") {
    syncTerminalSessionMeta();
    ensureNativeTerminalConnected();
  }
}

function applyTerminalTheme() {
  if (terminalThemeMode === "light") document.body.dataset.terminalMode = "light";
  else delete document.body.dataset.terminalMode;
  if (terminalThemeToggle) {
    terminalThemeToggle.textContent = terminalThemeMode === "light" ? "☀️" : "🌙";
    terminalThemeToggle.setAttribute(
      "aria-label",
      terminalThemeMode === "light" ? "ダークターミナルへ切り替え" : "ライトターミナルへ切り替え",
    );
  }
  nativeTerminal?.setThemeMode?.(terminalThemeMode);
}

function applyTerminalFontSize() {
  if (terminalFontSizeLabel) terminalFontSizeLabel.textContent = String(terminalFontSize);
  const index = terminalFontSizes.indexOf(terminalFontSize);
  if (terminalZoomOut) {
    terminalZoomOut.disabled = index <= 0;
    terminalZoomOut.classList.toggle("disabled", index <= 0);
  }
  if (terminalZoomIn) {
    terminalZoomIn.disabled = index >= terminalFontSizes.length - 1;
    terminalZoomIn.classList.toggle("disabled", index >= terminalFontSizes.length - 1);
  }
  nativeTerminal?.setFontSize?.(terminalFontSize);
}

function setTerminalInputMode(mode) {
  terminalInputMode = mode === "keys" ? "keys" : "text";
  localStorage.setItem("codexTerminalInputMode", terminalInputMode);
  for (const button of terminalModeButtons) {
    const active = button.dataset.terminalInputMode === terminalInputMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const panel of terminalPanels) {
    panel.classList.toggle("hidden", panel.dataset.terminalPanel !== terminalInputMode);
  }
}

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
  modelButton.innerHTML = `<span class="model-button-label">${escapeHtml(`${selectedModelLabel} ${selectedReasoning}`)}</span>${fontAwesomeIcon("chevronDown", "button-chevron-icon")}`;
  modelButton.setAttribute("aria-label", `モデル ${selectedModelLabel}、インテリジェンス ${selectedReasoning}`);
  for (const row of modelMenu.querySelectorAll("[data-reasoning]")) {
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

function selectReasoning(value) {
  selectedReasoning = value;
  localStorage.setItem("codexPhoneReasoning", value);
  updateModelButton();
  closeModelMenu();
  addStatus(`インテリジェンスを ${value} に設定しました。`);
}

function selectModel(model) {
  selectedModel = model;
  selectedModelLabel = model.replace(/^gpt-/, "").toUpperCase().replace(/^GPT-/, "");
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

function diffStatLabel(file) {
  const additions = Number(file.additions || 0);
  const deletions = Number(file.deletions || 0);
  return `<span class="diff-add">+${additions}</span><span class="diff-del">-${deletions}</span>`;
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

function setReady(ready) {
  sendButton.disabled = !ready;
  promptInput.disabled = !ready;
}

function renderHistory(history) {
  log.replaceChildren();
  statusGroup = null;
  for (const entry of history || []) addEntry(entry.type, entry.text, entry.attachments || []);
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

function renderHistoryIfChanged(history = []) {
  const signature = historySignature(history);
  if (signature === lastHistorySignature) return false;
  lastHistorySignature = signature;
  renderHistory(history);
  return true;
}

function renderThreadList() {
  threadList.replaceChildren();
  const query = threadSearch.value.trim().toLowerCase();
  const newProject = document.createElement("button");
  newProject.type = "button";
  newProject.className = selectedThread ? "project-heading new-project" : "project-heading new-project active";
  newProject.innerHTML = `${fontAwesomeIcon("folderPlus", "project-icon")}<span>New project</span>`;
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
    const hasLiveThread = threads.some((thread) => thread.live);
    const group = document.createElement("section");
    group.className = hasLiveThread ? "project-group has-live-thread" : "project-group";

    const heading = document.createElement("div");
    heading.className = hasLiveThread ? "project-heading project-heading-live" : "project-heading";
    const folder = document.createElement("span");
    folder.className = "project-icon-slot";
    folder.innerHTML = fontAwesomeIcon("folder", "project-icon");
    const name = document.createElement("span");
    name.textContent = project;
    heading.append(folder, name);
    if (hasLiveThread) {
      const badge = document.createElement("span");
      badge.className = "project-live-badge";
      badge.textContent = "LIVE";
      heading.appendChild(badge);
    }
    group.appendChild(heading);

    const visibleThreads = threads.slice(0, 6);
    for (const thread of visibleThreads) {
      const item = document.createElement("button");
      item.type = "button";
      const itemClasses = ["thread-item"];
      if (thread.id === selectedThread) itemClasses.push("active");
      if (thread.live) itemClasses.push("live");
      item.className = itemClasses.join(" ");
      item.title = titleForThread(thread);
      const title = document.createElement("span");
      title.className = "thread-title";
      title.textContent = titleForThread(thread);
      const time = document.createElement("span");
      time.className = "thread-time";
      time.textContent = formatRelativeTime(thread.updatedAt || thread.createdAt);
      if (thread.live) {
        const liveDot = document.createElement("span");
        liveDot.className = "thread-live-dot";
        liveDot.setAttribute("aria-label", "稼働中");
        item.append(liveDot);
      }
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
    const [historyResult, liveResult] = await Promise.allSettled([
      apiGet("/api/threads"),
      apiGet("/api/live-threads"),
    ]);
    if (historyResult.status === "rejected" && liveResult.status === "rejected") {
      throw historyResult.reason;
    }
    const historyRows = historyResult.status === "fulfilled" ? historyResult.value.data || [] : [];
    const liveRows = liveResult.status === "fulfilled" ? liveResult.value.data || [] : [];
    threadCache = mergeThreadRows(historyRows, liveRows);
    syncOpenSessionsFromThreads(liveRows);
    renderThreadList();
    lastThreadListError = "";
  } catch (error) {
    const message = error.message || String(error);
    if (message !== lastThreadListError) {
      lastThreadListError = message;
      addEntry("error", `thread一覧を読めませんでした: ${message}`);
    }
    if (!background) throw error;
  }
}

async function refreshSelectedThread() {
  if (!selectedThread || liveTurnActive || selectedThreadRefreshActive) return;
  if (!threadCache.some((thread) => thread.id === selectedThread)) {
    const resumable = resumeCandidateSession || readResumeSession();
    if (resumable?.threadId === selectedThread) return;
    clearSelectedThread({ reason: `一覧にないthreadの履歴表示を停止しました: ${selectedThread}` });
    return;
  }
  selectedThreadRefreshActive = true;
  try {
    const result = await apiGet(`/api/thread?thread=${encodeURIComponent(selectedThread)}`);
    if (result.threadId !== selectedThread) return;
    renderHistoryIfChanged(result.history || []);
    lastThreadRefreshError = "";
  } catch (error) {
    const message = error.message || String(error);
    if (recoverMissingSelectedThread(message)) return;
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
  localStorage.removeItem("codexPhoneLastThread");
  updateUrlThread();
  renderHistory([]);
  renderThreadList();
  threadTitle.textContent = "新しい共有thread";
  syncTerminalSessionMeta();
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

function syncReadyThread(threadId, options = {}) {
  if (!threadId) return;
  selectedThread = threadId;
  updateUrlThread();
  threadCache = threadCache.map((thread) => {
    if (thread.id === threadId || !thread.live) return thread;
    const { live, ready, clients, ...historyThread } = thread;
    return historyThread;
  });
  const existingIndex = threadCache.findIndex((thread) => thread.id === threadId);
  const existingThread = existingIndex >= 0 ? threadCache[existingIndex] : null;
  const liveThread = {
    id: threadId,
    threadId,
    cwd: existingThread?.cwd || currentWorkdir,
    status: remoteSessionState?.status || "ready",
    ready: true,
    live: true,
    updatedAt: Date.now(),
  };
  if (existingIndex >= 0) threadCache[existingIndex] = { ...threadCache[existingIndex], ...liveThread };
  else threadCache.unshift({ ...liveThread, preview: "稼働中スレッド" });
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  threadTitle.textContent = selected ? titleForThread(selected) : selectedThread;
  addOrUpdateOpenSession({
    threadId,
    cwd: currentWorkdir,
    title: selected ? titleForThread(selected) : basenameForPath(currentWorkdir),
    status: remoteSessionState?.status || "ready",
  });
  renderThreadList();
  syncTerminalSessionMeta();
  if (options.prewarmTerminal) ensureNativeTerminalConnected({ focus: activeMainMode === "terminal" });
}

function selectThread(threadId) {
  selectedThread = threadId;
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  if (selected) {
    const session = addOrUpdateOpenSession({
      threadId: selected.id,
      cwd: selected.cwd || "",
      title: titleForThread(selected),
      status: "ready",
    });
    activeSessionKey = session?.key || activeSessionKey;
  }
  updateUrlThread();
  renderThreadList();
  closeSidebar();
  connect();
}

function setCurrentWorkdir(workdir) {
  currentWorkdir = workdir || currentWorkdir || "";
  applyPathbarColor();
  syncHeaderCwd();
  syncTerminalSessionMeta();
  if (activeMainMode === "terminal") ensureNativeTerminalConnected();
}

function syncHeaderCwd() {
  if (!headerCwd) return;
  const cwd = currentWorkdir || "準備中";
  headerCwd.textContent = currentWorkdir ? displayPath(currentWorkdir) : cwd;
  headerCwd.title = currentWorkdir || "";
}

function syncTerminalSessionMeta() {
  if (!terminalSessionMeta) return;
  const thread = selectedThread || "thread準備中";
  const cwd = currentWorkdir ? displayPath(currentWorkdir) : "cwd準備中";
  const stateLabel = remoteSessionState?.label ? `  •  ${remoteSessionState.label}` : "";
  terminalSessionMeta.textContent = `${thread}  •  ${cwd}${stateLabel}`;
}

function terminalSocketUrl({ threadId, cwd, cols, rows }) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/terminal`);
  url.searchParams.set("thread", threadId);
  if (cwd) url.searchParams.set("cwd", cwd);
  if (token) url.searchParams.set("token", token);
  if (cols) url.searchParams.set("cols", String(cols));
  if (rows) url.searchParams.set("rows", String(rows));
  return url.toString();
}

function ensureNativeTerminalConnected(options = {}) {
  if (!terminalHost || !window.CodexNativeTerminal) {
    if (terminalFallback) {
      terminalFallback.textContent = "xterm bundle を読み込めませんでした。npm run build:ui を実行してください。";
      terminalFallback.classList.remove("hidden");
    }
    return false;
  }
  if (!selectedThread) {
    if (terminalFallback) {
      terminalFallback.textContent = "thread が準備できたら Codex CLI TUI を開始します。";
      terminalFallback.classList.remove("hidden");
    }
    return false;
  }
  if (!nativeTerminal) {
    nativeTerminal = new window.CodexNativeTerminal({
      host: terminalHost,
      fallback: terminalFallback,
      buildUrl: terminalSocketUrl,
      fontSize: terminalFontSize,
      themeMode: terminalThemeMode,
      onStatus: (text) => {
        if (terminalStatus) terminalStatus.textContent = text || "Codex Terminal";
      },
      onSessionState: applyRemoteSessionState,
      onLongPressActiveChange: (active) => {
        terminalLongPressActive = Boolean(active);
        document.body.classList.toggle("terminal-touch-lock", terminalLongPressActive);
      },
    });
  }
  return nativeTerminal.connect({
    threadId: selectedThread,
    cwd: currentWorkdir,
    force: Boolean(options.force),
    focus: options.focus ?? activeMainMode === "terminal",
  });
}

function sendNativeTerminalInput(data) {
  const decoded = String(data || "")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\u007f/g, "\x7f")
    .replace(/\\u001b/g, "\u001b")
    .replace(/\\u0003/g, "\u0003");
  if (isRemoteSessionRunning() && !decoded.includes("\u0003")) {
    addStatus("Codex 処理中のため、ターミナル入力を一時停止しています。");
    return false;
  }
  if (!nativeTerminal && !ensureNativeTerminalConnected()) return;
  nativeTerminal?.sendInput(decoded);
  nativeTerminal?.focus();
  return true;
}

function appendTerminalPromptLine(line) {
  if (!terminalPrompt || !line) return;
  const current = terminalPrompt.value || "";
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  terminalPrompt.value = `${current}${separator}${line}\n`;
  setTerminalInputMode("text");
  terminalPrompt.focus();
}

function submitTerminalPrompt() {
  if (!terminalPrompt) return;
  const text = terminalPrompt.value;
  if (text.length === 0) {
    sendNativeTerminalInput("\r");
    return;
  }
  if (!sendNativeTerminalInput(text)) return;
  terminalPrompt.value = "";
  if (terminalSend) terminalSend.textContent = "Enter ↵";
  terminalPrompt.focus();
}

async function handleTerminalAction(action) {
  if (action === "cwd") {
    appendTerminalPromptLine(currentWorkdir || ".");
    return;
  }
  if (action === "attach") {
    terminalFileInput?.click();
    return;
  }
  if (action === "copy") {
    const text = nativeTerminal?.visibleText?.() || "";
    if (!text) {
      addStatus("コピーできるターミナル表示がありません。");
      return;
    }
    const copied = await copyTextToClipboard(text);
    if (copied) {
      if (terminalStatus) terminalStatus.textContent = "ターミナル表示をコピーしました";
      addStatus("ターミナル表示をコピーしました。");
      return;
    }
    showTerminalCopyFallback(text);
    if (terminalStatus) terminalStatus.textContent = "コピー用テキストを表示中";
    addStatus("ブラウザが自動コピーを拒否したため、コピー用テキストを表示しました。");
  }
}

function showTerminalCtrlCConfirm() {
  terminalCtrlCConfirm?.classList.remove("hidden");
}

function hideTerminalCtrlCConfirm() {
  terminalCtrlCConfirm?.classList.add("hidden");
}

function startNewThread() {
  openSessionCreatePage();
}

function startNewThreadInCwd(cwd) {
  forceNewThreadOnce = true;
  nextThreadCwd = cwd;
  pushCwdHistory(cwd);
  closeSessionCreatePage();
  selectThread("");
}

function openSessionCreatePage(initialCwd = defaultDeveloperPath()) {
  const nextCwd = initialCwd || defaultDeveloperPath();
  sessionCreateCwd = nextCwd;
  sessionBrowserCurrentPath = nextCwd || sessionBrowserCurrentPath || defaultDeveloperPath();
  sessionShowHidden = false;
  if (sessionHiddenToggle) sessionHiddenToggle.checked = false;
  renderSessionCreatePage();
  sessionCreatePage?.classList.remove("hidden");
  closeSidebar();
  closeSessionSwitcher();
  void loadSessionBrowser(sessionBrowserCurrentPath);
}

function closeSessionCreatePage() {
  sessionCreatePage?.classList.add("hidden");
}

function renderSessionCreatePage() {
  if (sessionSelectedCwd) {
    sessionSelectedCwd.innerHTML = sessionCreateCwd
      ? `
        <span class="session-card-main">
          <strong>${escapeHtml(basenameForPath(sessionCreateCwd))}</strong>
          <span>${escapeHtml(displayPath(sessionCreateCwd))}</span>
        </span>
        <span class="session-card-check" aria-hidden="true">✓</span>
      `
      : `
        <span class="session-card-main">
          <strong>フォルダを選択</strong>
          <span>下のブラウザから作業ディレクトリを選択</span>
        </span>
      `;
  }
  if (sessionStartButton) sessionStartButton.disabled = !sessionCreateCwd;
  renderSessionRecentList();
}

function renderSessionRecentList() {
  if (!sessionRecentList) return;
  sessionRecentList.replaceChildren();
  if (sessionRecentClear) sessionRecentClear.disabled = !cwdHistory.length;
  if (!cwdHistory.length) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.innerHTML = "<strong>最近使ったプロジェクトはまだありません。</strong><span>下のフォルダブラウザから開始先を選ぶと、次回ここに表示されます。</span>";
    sessionRecentList.appendChild(empty);
    return;
  }
  for (const cwd of cwdHistory) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = cwd === sessionCreateCwd ? "session-card session-project-card active" : "session-card session-project-card";
    card.innerHTML = `
      <span class="session-card-icon" aria-hidden="true">${fontAwesomeIcon("folder", "project-icon")}</span>
      <span class="session-card-main">
        <span class="session-card-title">${escapeHtml(basenameForPath(cwd))}</span>
        <span class="session-card-path">${escapeHtml(displayPath(cwd))}</span>
        <span class="session-card-meta">最近使用</span>
      </span>
      ${cwd === sessionCreateCwd ? '<span class="session-card-check" aria-hidden="true">✓</span>' : ""}
    `;
    card.addEventListener("click", () => {
      sessionCreateCwd = cwd;
      sessionBrowserCurrentPath = cwd;
      renderSessionCreatePage();
      void loadSessionBrowser(cwd);
    });
    sessionRecentList.appendChild(card);
  }
}

function clearSessionRecentHistory() {
  cwdHistory = [];
  localStorage.removeItem(cwdHistoryStorageKey);
  localStorage.removeItem("codexRemoteLastCwd");
  renderSessionCreatePage();
}

function sessionDirectorySearchText() {
  return String(sessionDirectorySearch?.value || "").trim().toLowerCase();
}

function renderSessionBrowserEntries() {
  if (!sessionBrowserList) return;
  sessionBrowserList.replaceChildren();
  const searchText = sessionDirectorySearchText();
  const entries = searchText
    ? sessionBrowserEntries.filter((entry) => `${entry.name || ""} ${entry.path || ""}`.toLowerCase().includes(searchText))
    : sessionBrowserEntries;
  for (const entry of entries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "session-card session-folder-card";
    row.innerHTML = `
      <span class="session-card-icon" aria-hidden="true">${fontAwesomeIcon("folder", "project-icon")}</span>
      <span class="session-card-main">
        <span class="session-card-title">${escapeHtml(entry.name)}</span>
        <span class="session-card-path">${escapeHtml(displayPath(entry.path))}</span>
      </span>
    `;
    row.addEventListener("click", () => loadSessionBrowser(entry.path));
    sessionBrowserList.appendChild(row);
  }
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = searchText ? "一致するフォルダはありません。" : "下位フォルダはありません。";
    sessionBrowserList.appendChild(empty);
  }
}

async function loadSessionBrowser(pathValue = "", options = {}) {
  if (!sessionBrowserList || !sessionBrowserPath) return;
  if (!options.preserveSearch && sessionDirectorySearch) sessionDirectorySearch.value = "";
  sessionBrowserList.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "session-empty";
  loading.textContent = "読み込み中...";
  sessionBrowserList.appendChild(loading);
  const query = new URLSearchParams();
  if (pathValue) query.set("path", pathValue);
  if (sessionShowHidden) query.set("hidden", "1");
  try {
    const suffix = query.toString() ? `?${query}` : "";
    const listing = await apiGet(`/api/fs/list${suffix}`);
    sessionBrowserCurrentPath = listing.path || "";
    sessionBrowserParentPath = listing.parent || "";
    sessionCreateCwd = listing.path || "";
    sessionBrowserPath.textContent = displayPath(listing.path) || "/";
    sessionBrowserPath.title = listing.path || "";
    sessionBrowserUp.disabled = !sessionBrowserParentPath;
    renderSessionCreatePage();
    sessionBrowserEntries = listing.entries || [];
    renderSessionBrowserEntries();
  } catch (error) {
    sessionBrowserEntries = [];
    sessionBrowserList.replaceChildren();
    const failed = document.createElement("div");
    failed.className = "session-empty error";
    failed.textContent = `読み込みに失敗しました: ${error.message}`;
    sessionBrowserList.appendChild(failed);
  }
}

function startSelectedSession() {
  if (!sessionCreateCwd) return;
  startNewThreadInCwd(sessionCreateCwd);
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
  const displayText = displayPath(text);
  const displayDetail = displayPath(detail);
  row.innerHTML = detail
    ? `${iconHtml}<span class="panel-row-copy"><strong>${escapeHtml(displayText)}</strong><small>${escapeHtml(displayDetail)}</small></span>`
    : `${iconHtml}<span class="panel-row-copy">${escapeHtml(displayText)}</span>`;
  if (displayText !== String(text || "")) row.title = String(text || "");
  if (displayDetail !== String(detail || "")) row.title = [row.title, String(detail || "")].filter(Boolean).join("\n");
  if (onClick) row.addEventListener("click", onClick);
  artifactList.appendChild(row);
  return row;
}

function appendToPrompt(text) {
  promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}${text}`;
  promptInput.focus();
}

async function copyTextToClipboard(text) {
  if (!String(text || "").trim()) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // ブラウザや権限状態で Clipboard API が拒否されるため、旧式コピーへ落とす。
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand?.("copy") === true;
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function closeTerminalCopyFallback() {
  terminalCopyFallbackDialog?.remove();
  terminalCopyFallbackDialog = null;
}

function selectCopyFallbackText(textarea) {
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  });
}

function showTerminalCopyFallback(text) {
  closeTerminalCopyFallback();

  const overlay = document.createElement("div");
  overlay.className = "terminal-copy-fallback";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "terminalCopyFallbackTitle");

  const card = document.createElement("div");
  card.className = "terminal-copy-card";

  const title = document.createElement("strong");
  title.id = "terminalCopyFallbackTitle";
  title.textContent = "コピー用テキスト";

  const description = document.createElement("p");
  description.textContent = "ブラウザが自動コピーを拒否しました。選択済みの内容をコピーしてください。";

  const textarea = document.createElement("textarea");
  textarea.className = "terminal-copy-textarea";
  textarea.readOnly = true;
  textarea.value = text;
  textarea.setAttribute("aria-label", "ターミナル表示のコピー用テキスト");

  const actions = document.createElement("div");
  actions.className = "terminal-confirm-actions";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "再コピー";
  retry.addEventListener("click", async () => {
    const copied = await copyTextToClipboard(text);
    if (copied) {
      closeTerminalCopyFallback();
      if (terminalStatus) terminalStatus.textContent = "ターミナル表示をコピーしました";
      addStatus("ターミナル表示をコピーしました。");
      return;
    }
    selectCopyFallbackText(textarea);
    if (terminalStatus) terminalStatus.textContent = "コピー用テキストを選択中";
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "閉じる";
  close.addEventListener("click", closeTerminalCopyFallback);

  actions.append(retry, close);
  card.append(title, description, textarea, actions);
  overlay.appendChild(card);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeTerminalCopyFallback();
  });
  document.body.appendChild(overlay);
  terminalCopyFallbackDialog = overlay;
  selectCopyFallbackText(textarea);
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
    const row = addPanelRow(label, item.path || "", () => showArtifact(item.path), icon);
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

function showToolError(name, error) {
  clearPanel(name);
  addPanelRow("読み込みに失敗しました", error.message);
  addEntry("error", `${name}: ${error.message}`);
  document.body.classList.remove("show-sidebar");
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
      if (!plugins.length) addPanelRow(marketplace.name || marketplace.id || "marketplace", "プラグインなし");
      for (const plugin of plugins) {
        const summary = plugin.summary || plugin;
        addPanelRow(summary.name || summary.id, summary.enabled ? "enabled" : summary.installed ? "installed" : "available");
      }
    }
    if (!artifactList.children.length) addPanelRow("プラグインは見つかりませんでした");
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

function showSources() {
  clearPanel("情報源", "sources");
  addPanelRow("Web調査を入力へ追加", "外部確認が必要なターンで使う", () => {
    appendToPrompt("Web調査を使って確認してください。");
    addStatus("Web調査指示をチャット入力へ追加しました。");
  }, "WEB");
  addPanelRow("スキル", "利用可能な skill を入力へ追加", showSkills, "SK");
  addPanelRow("ローカルファイル", "Filesタブから @path を追加できます", showWorkspace, "FILE");
  addPanelRow("フォルダを選んで新しいチャット", "home 配下のフォルダだけ表示", () => showFolderBrowser(currentWorkdir), "DIR");
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
    const result = await apiGet("/api/status");
    addPanelRow("UI port", String(result.uiPort));
    addPanelRow("Codex app-server", result.codexUrl);
    addPanelRow("履歴同期", result.historySyncEnabled ? "有効" : "無効");
    addPanelRow("作業ディレクトリ", result.workdir);
    for (const bridge of result.bridges || []) {
      addPanelRow(bridge.threadId || "thread準備中", `${bridge.clients}端末 / ${bridge.ready ? "ready" : "starting"}`);
    }
  } catch (error) {
    showToolError("バックグラウンド", error);
  }
}

async function showArtifact(path) {
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

function bindSessionSwipe() {
  const surface = document.querySelector(".mode-stage");
  if (!surface) return;
  let gesture = null;
  let wheelGesture = { accumX: 0, lastWheelAt: 0, lastSwitchAt: 0 };
  const touchActivatePx = 18;
  const touchDistanceRatio = 0.16;
  const touchVelocityPxPerMs = 0.32;
  const wheelResetMs = 180;
  const wheelCooldownMs = 350;
  const wheelMinThresholdPx = 42;
  const wheelMaxThresholdPx = 110;
  const wheelThresholdRatio = 0.12;
  const isOverlayOpen = () =>
    sessionCreatePage?.classList.contains("hidden") === false ||
    sessionSwitcherOverlay?.classList.contains("hidden") === false;
  const isControlTarget = (target) => {
    if (!target?.closest) return false;
    if (target.closest("#terminalHost")) return false;
    return Boolean(
      target.closest(
        "input, textarea, select, button, a, [contenteditable='true'], #composer, #terminalInputArea, .terminal-toolbar, .approval",
      ),
    );
  };
  const isSwipeBlocked = (event) => terminalLongPressActive || isOverlayOpen() || isControlTarget(event?.target);
  surface.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || isSwipeBlocked(event)) return;
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, time: Date.now(), active: false };
  }, { passive: true });
  surface.addEventListener("touchmove", (event) => {
    if (!gesture || event.touches.length !== 1) return;
    if (terminalLongPressActive) {
      gesture = null;
      return;
    }
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.active && Math.abs(dx) > touchActivatePx && Math.abs(dx) > Math.abs(dy) * 1.25) gesture.active = true;
    if (gesture.active) event.preventDefault();
  }, { passive: false });
  const finish = (event) => {
    if (!gesture) return;
    const touch = event.changedTouches?.[0];
    const dx = touch ? touch.clientX - gesture.x : 0;
    const elapsed = Math.max(1, Date.now() - gesture.time);
    const velocity = Math.abs(dx) / elapsed;
    const shouldSwitch = gesture.active && (Math.abs(dx) > surface.clientWidth * touchDistanceRatio || velocity > touchVelocityPxPerMs);
    if (shouldSwitch) switchOpenSessionByOffset(dx < 0 ? 1 : -1);
    gesture = null;
  };
  surface.addEventListener("touchend", finish, { passive: true });
  surface.addEventListener("touchcancel", () => {
    gesture = null;
  }, { passive: true });
  surface.addEventListener("wheel", (event) => {
    if (isSwipeBlocked(event)) return;
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.1) return;
    event.preventDefault();
    const now = Date.now();
    if (now - wheelGesture.lastWheelAt > wheelResetMs) wheelGesture.accumX = 0;
    wheelGesture.lastWheelAt = now;
    wheelGesture.accumX += event.deltaX;
    if (now - wheelGesture.lastSwitchAt < wheelCooldownMs) return;
    const threshold = Math.max(
      wheelMinThresholdPx,
      Math.min(wheelMaxThresholdPx, surface.clientWidth * wheelThresholdRatio),
    );
    if (Math.abs(wheelGesture.accumX) < threshold) return;
    switchOpenSessionByOffset(wheelGesture.accumX > 0 ? 1 : -1);
    wheelGesture = { accumX: 0, lastWheelAt: now, lastSwitchAt: now };
  }, { passive: false });
}

function sendPromptToBridge(text, attachments = []) {
  const trimmed = String(text || "").trim();
  if ((!trimmed && !attachments.length) || !ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(
    JSON.stringify({
      type: "prompt",
      token,
      text: trimmed || "添付画像を確認してください。",
      attachments,
      options: {
        model: selectedModel || undefined,
        approvalPolicy: accessMode.approvalPolicy,
        sandboxMode: accessMode.sandboxMode,
      },
    }),
  );
  return true;
}

function connect() {
  if (tokenRequired && !token) {
    addEntry("error", "URLに token がありません。Mac側に表示されたURLをそのまま開いてください。");
    return;
  }
  if (ws) ws.close();
  liveTurnActive = false;
  remoteSessionState = null;
  setRunState("connecting");
  lastHistorySignature = "";
  renderHistory([]);
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  threadTitle.textContent = selected ? titleForThread(selected) : "新しい共有thread";

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
  ws = new WebSocket(`${proto}//${location.host}/bridge${bridgeQuery ? `?${bridgeQuery}` : ""}`);
  connectButton.disabled = true;
  meta.textContent = "接続中";
  syncHeaderCwd();

  ws.addEventListener("open", () => {
    setRunState("connecting", "Codex に接続中");
    addEntry("status", "Macの共有ブリッジへ接続しました。");
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ready") {
      setReady(true);
      setCurrentWorkdir(msg.workdir);
      const materialized = Boolean((msg.history || []).length);
      syncReadyThread(msg.threadId, { prewarmTerminal: materialized });
      renderHistoryIfChanged(msg.history || []);
      meta.textContent = `${msg.model}  •  ${msg.clients}端末`;
      setRunState("ready");
      if (msg.sessionState) applyRemoteSessionState(msg.sessionState);
      addEntry("status", `共有Codex thread ready: ${msg.threadId}`);
      return;
    }
    if (msg.type === "sessionState") {
      applyRemoteSessionState(msg.state);
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
      pendingApproval = msg.request;
      setRunState("approval");
      approvalText.textContent = JSON.stringify(msg.request.params, null, 2);
      approval.classList.remove("hidden");
      return;
    }
    if (msg.type === "turn" && msg.status === "completed") {
      liveTurnActive = false;
      lastHistorySignature = "";
      assistantEntry = null;
      setRunState("done", "完了しました");
      ensureNativeTerminalConnected({ focus: activeMainMode === "terminal" });
      loadThreads();
      refreshSelectedThread();
      return;
    }
    if (msg.type === "error") {
      if (recoverMissingSelectedThread(msg.text)) return;
      setRunState("error", msg.text || "エラー");
      addEntry("error", msg.text);
      return;
    }
    if (msg.type === "status") {
      if (/履歴同期を更新しました/.test(msg.text || "")) setRunState("done", "完了・履歴同期済み");
      else if (/履歴同期に失敗/.test(msg.text || "")) setRunState("error", "履歴同期に失敗");
      else if (/履歴同期/.test(msg.text || "")) setRunState("syncing", msg.text);
      addEntry("status", msg.text);
    }
  });

  ws.addEventListener("close", () => {
    setReady(false);
    connectButton.disabled = false;
    meta.textContent = "切断";
    setRunState("disconnected");
  });
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!sendPromptToBridge(text, pendingFiles)) return;
  promptInput.value = "";
  pendingFiles = [];
  renderAttachments();
});
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    composer.requestSubmit();
  }
});

approveButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "accept", request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
  setRunState("running", "承認済み・処理中");
});

declineButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "decline", request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
  setRunState("running", "拒否済み・処理中");
});

newThreadButton.addEventListener("click", () => openSessionCreatePage());
searchButton.addEventListener("click", () => {
  threadSearch.classList.toggle("hidden");
  threadSearch.focus();
  renderThreadList();
  openSidebar();
});
threadSearch.addEventListener("input", renderThreadList);
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
pathbarColorPicker?.addEventListener("input", () => {
  savePathbarColorForCurrentWorkdir(pathbarColorPicker.value);
});
sessionSwitcher?.addEventListener("click", openSessionSwitcher);
sessionSwitcher?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openSessionSwitcher();
  }
});
sessionSwitcherClose?.addEventListener("click", closeSessionSwitcher);
sessionSwitcherNew?.addEventListener("click", () => openSessionCreatePage());
sessionCreateCancel?.addEventListener("click", closeSessionCreatePage);
sessionRecentClear?.addEventListener("click", clearSessionRecentHistory);
sessionBrowserUp?.addEventListener("click", () => {
  if (sessionBrowserParentPath) void loadSessionBrowser(sessionBrowserParentPath);
});
sessionDirectorySearch?.addEventListener("input", renderSessionBrowserEntries);
sessionHiddenToggle?.addEventListener("change", () => {
  sessionShowHidden = Boolean(sessionHiddenToggle.checked);
  void loadSessionBrowser(sessionBrowserCurrentPath || defaultDeveloperPath(), { preserveSearch: true });
});
sessionStartButton?.addEventListener("click", startSelectedSession);
closePanelButton.addEventListener("click", () => closeRightPanel({ restoreFocus: true }));
for (const button of modeButtons) {
  button.addEventListener("click", () => setMainMode(button.dataset.mainMode));
}
terminalReconnect?.addEventListener("click", () => {
  setMainMode("terminal");
  ensureNativeTerminalConnected({ force: true });
});
terminalThemeToggle?.addEventListener("click", () => {
  terminalThemeMode = terminalThemeMode === "dark" ? "light" : "dark";
  localStorage.setItem("codexTerminalThemeMode", terminalThemeMode);
  applyTerminalTheme();
});
terminalZoomOut?.addEventListener("click", () => {
  const index = terminalFontSizes.indexOf(terminalFontSize);
  if (index <= 0) return;
  terminalFontSize = terminalFontSizes[index - 1];
  localStorage.setItem("codexTerminalFontSize", String(terminalFontSize));
  applyTerminalFontSize();
});
terminalZoomIn?.addEventListener("click", () => {
  const index = terminalFontSizes.indexOf(terminalFontSize);
  if (index < 0 || index >= terminalFontSizes.length - 1) return;
  terminalFontSize = terminalFontSizes[index + 1];
  localStorage.setItem("codexTerminalFontSize", String(terminalFontSize));
  applyTerminalFontSize();
});
for (const button of terminalModeButtons) {
  button.addEventListener("click", () => setTerminalInputMode(button.dataset.terminalInputMode));
}
for (const button of terminalNativeInputButtons) {
  button.addEventListener("click", () => sendNativeTerminalInput(button.dataset.terminalPtyInput || ""));
}
for (const button of terminalActionButtons) {
  button.addEventListener("click", () => void handleTerminalAction(button.dataset.terminalAction));
}
terminalSend?.addEventListener("click", submitTerminalPrompt);
terminalPrompt?.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    submitTerminalPrompt();
  }
});
terminalPrompt?.addEventListener("input", () => {
  if (terminalSend) terminalSend.textContent = terminalPrompt.value.length === 0 ? "Enter ↵" : "Send";
});
terminalCtrlCButton?.addEventListener("click", showTerminalCtrlCConfirm);
terminalCtrlCCancel?.addEventListener("click", hideTerminalCtrlCConfirm);
terminalCtrlCConfirmButton?.addEventListener("click", () => {
  sendNativeTerminalInput("\u0003");
  hideTerminalCtrlCConfirm();
});
terminalFileInput?.addEventListener("change", () => {
  const file = terminalFileInput.files?.[0];
  terminalFileInput.value = "";
  if (!file) return;
  appendTerminalPromptLine(`添付画像: ${file.name}`);
  addStatus("画像名をターミナル入力欄に追加しました。実ファイルの参照が必要な場合はフォルダパスも追加してください。");
});
artifactPreview.addEventListener("click", (event) => {
  if (event.target.closest("[data-preview-close]")) hideArtifactPreview();
});
addButton.addEventListener("click", () => fileInput.click());
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
  const reasoningRow = event.target.closest("[data-reasoning]");
  if (reasoningRow) {
    selectReasoning(reasoningRow.dataset.reasoning);
    return;
  }
  const modelRow = event.target.closest("[data-model-choice]");
  if (modelRow) {
    selectModel(modelRow.dataset.modelChoice);
    return;
  }
  if (event.target.closest("#moreModelsButton")) {
    closeModelMenu();
    showModels();
  }
});
document.addEventListener("click", async (event) => {
  const artifactOpen = event.target.closest("[data-open-artifact-path]");
  if (artifactOpen) {
    showArtifact(artifactOpen.dataset.openArtifactPath);
    return;
  }

  const button = event.target.closest("[data-message-action='copy']");
  if (!button) return;
  const entry = button.closest(".entry");
  const body = entry?.querySelector(".entry-body");
  const text = body?.markdownSource || body?.innerText || "";
  if (!text.trim()) return;
  const copied = await copyTextToClipboard(text);
  if (copied) {
    addStatus("メッセージをコピーしました。");
  } else {
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
setMainMode(activeMainMode);
setTerminalInputMode(terminalInputMode);
applyTerminalTheme();
applyTerminalFontSize();
if (terminalSend && terminalPrompt) terminalSend.textContent = terminalPrompt.value.length === 0 ? "Enter ↵" : "Send";
setAccessButtonLabel();
updateModelButton();
modelButton.setAttribute("aria-haspopup", "menu");
modelButton.setAttribute("aria-expanded", "false");
loadPanelWidths();
bindResizeHandle(leftResizeHandle, "left");
bindResizeHandle(rightResizeHandle, "right");
bindSessionSwipe();
syncSidebarState();
syncRightPanelState();
renderSessionChrome();
renderSessionCreatePage();
loadBridgeInfo()
  .then(() => loadArtifacts())
  .then(() => loadThreads().catch(() => {}))
  .then(() => {
    restoreActiveSessionFromStorage();
    connect();
  })
  .catch(() => {
    setRunState("error", "bridge情報を確認できません");
  });
setInterval(() => loadThreads({ background: true }), 10_000);
setInterval(refreshSelectedThread, 3_000);
