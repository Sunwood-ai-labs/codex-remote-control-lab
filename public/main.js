const log = document.querySelector("#log");
const meta = document.querySelector("#meta");
const connectButton = document.querySelector("#connect");
const threads = document.querySelector("#threads");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#send");
const approval = document.querySelector("#approval");
const approvalText = document.querySelector("#approvalText");
const approveButton = document.querySelector("#approve");
const declineButton = document.querySelector("#decline");

const params = new URLSearchParams(location.search);
const token = params.get("token") || localStorage.getItem("codexPhoneToken") || "";
let selectedThread = params.get("thread") || "";
if (token) localStorage.setItem("codexPhoneToken", token);

let ws = null;
let pendingApproval = null;
let assistantEntry = null;

function addEntry(kind, text) {
  const el = document.createElement("div");
  el.className = `entry ${kind}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function setReady(ready) {
  sendButton.disabled = !ready;
  promptInput.disabled = !ready;
}

function renderHistory(history) {
  log.replaceChildren();
  for (const entry of history || []) addEntry(entry.type, entry.text);
}

async function loadThreads() {
  if (!token) return;
  try {
    const response = await fetch(`/api/threads?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const result = await response.json();
    threads.replaceChildren();
    const fresh = document.createElement("option");
    fresh.value = "";
    fresh.textContent = "新しい共有thread";
    threads.appendChild(fresh);
    for (const thread of result.data || []) {
      const option = document.createElement("option");
      option.value = thread.id;
      const title = thread.name || thread.preview || thread.cwd || thread.id;
      option.textContent = title.length > 42 ? `${title.slice(0, 42)}...` : title;
      threads.appendChild(option);
    }
    threads.value = selectedThread;
  } catch (error) {
    addEntry("error", `thread一覧を読めませんでした: ${error.message}`);
  }
}

function connect() {
  if (!token) {
    addEntry("error", "URLに token がありません。Mac側に表示されたURLをそのまま開いてください。");
    return;
  }
  if (ws) ws.close();
  renderHistory([]);
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const threadParam = selectedThread ? `&thread=${encodeURIComponent(selectedThread)}` : "";
  ws = new WebSocket(`${proto}//${location.host}/bridge?token=${encodeURIComponent(token)}${threadParam}`);
  connectButton.disabled = true;
  meta.textContent = "接続中";

  ws.addEventListener("open", () => {
    addEntry("status", "スマホUIからMacのブリッジへ接続しました。");
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ready") {
      setReady(true);
      renderHistory(msg.history || []);
      meta.textContent = `${msg.model} / ${msg.workdir} / ${msg.clients}端末`;
      addEntry("status", `共有Codex thread ready: ${msg.threadId}`);
      return;
    }
    if (msg.type === "user") {
      assistantEntry = null;
      addEntry("user", msg.text);
      return;
    }
    if (msg.type === "assistantDelta") {
      if (!assistantEntry) assistantEntry = addEntry("assistant", "");
      assistantEntry.textContent += msg.text;
      log.scrollTop = log.scrollHeight;
      return;
    }
    if (msg.type === "approval") {
      pendingApproval = msg.request;
      approvalText.textContent = JSON.stringify(msg.request.params, null, 2);
      approval.classList.remove("hidden");
      return;
    }
    if (msg.type === "turn" && msg.status === "completed") {
      assistantEntry = null;
      return;
    }
    if (msg.type === "error") {
      addEntry("error", msg.text);
      return;
    }
    if (msg.type === "status") {
      addEntry("status", msg.text);
    }
  });

  ws.addEventListener("close", () => {
    setReady(false);
    connectButton.disabled = false;
    meta.textContent = "切断";
  });
}

threads.addEventListener("change", () => {
  selectedThread = threads.value;
  const next = new URL(location.href);
  if (selectedThread) next.searchParams.set("thread", selectedThread);
  else next.searchParams.delete("thread");
  history.replaceState(null, "", next);
  connect();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "prompt", token, text }));
  promptInput.value = "";
});

approveButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "accept", request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
});

declineButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "decline", request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
});

connectButton.addEventListener("click", connect);
setReady(false);
loadThreads().finally(connect);
