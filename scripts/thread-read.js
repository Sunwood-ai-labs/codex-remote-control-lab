const { sessionHistoryFromThread } = require("./session-jsonl-history");

function liveBridgeSnapshot(bridge, threadId) {
  if (!bridge) return null;
  const matchesThread = bridge.threadId === threadId || bridge.requestedThreadId === threadId;
  if (!matchesThread) return null;
  if (!bridge.ready && bridge.startupFailed) return null;
  return {
    threadId,
    ready: !!bridge.ready,
    history: Array.isArray(bridge.history) ? bridge.history : [],
    source: "live-bridge",
  };
}

function findLiveBridge(bridges, threadId) {
  if (!bridges || !threadId) return null;
  const direct = bridges.get?.(threadId);
  if (direct) return direct;
  for (const bridge of bridges.values?.() || []) {
    if (bridge.threadId === threadId || bridge.requestedThreadId === threadId) return bridge;
  }
  return null;
}

function previewFromHistory(history = []) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const text = String(entry?.text || "").trim();
    if (!text) continue;
    return text.split(/\r?\n/).find(Boolean)?.slice(0, 160) || text.slice(0, 160);
  }
  return "";
}

function clientCountForBridge(bridge) {
  if (bridge?.clients && typeof bridge.clients.size === "number") return bridge.clients.size;
  return Number(bridge?.clients || 0);
}

function liveThreadSummaries(bridges, options = {}) {
  const now = Number(options.now || Date.now());
  const rows = [];
  const seen = new Set();

  for (const bridge of bridges?.values?.() || []) {
    if (!bridge || bridge.startupFailed) continue;
    const id = bridge.threadId || bridge.requestedThreadId || "";
    if (!id) continue;
    const cwd = bridge.cwd || "";
    const key = `${id}::${cwd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const updatedAt = Number(bridge.updatedAt || bridge.createdAt || now);
    rows.push({
      id,
      threadId: id,
      cwd,
      name: null,
      preview: previewFromHistory(bridge.history) || (bridge.ready ? "稼働中スレッド" : "起動中"),
      ready: !!bridge.ready,
      clients: clientCountForBridge(bridge),
      updatedAt,
      createdAt: Number(bridge.createdAt || updatedAt),
      source: "live-bridge",
    });
  }

  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

function snapshotFromThread({ thread, threadId, historyFromThread }) {
  const appServerHistory = historyFromThread(thread);
  if (appServerHistory.length) {
    return {
      threadId: thread.id || threadId,
      history: appServerHistory,
      source: "app-server",
    };
  }

  const jsonlHistory = sessionHistoryFromThread(thread);
  if (jsonlHistory.length) {
    return {
      threadId: thread.id || threadId,
      history: jsonlHistory,
      source: "session-jsonl",
    };
  }

  return {
    threadId: thread.id || threadId,
    history: [],
    source: "app-server",
  };
}

function historySignature(history = []) {
  return history
    .map((entry) => `${entry?.type || ""}:${entry?.text || ""}`)
    .join("\n");
}

async function readThreadSnapshot({ threadId, liveBridge, request, model, workdir, historyFromThread, refreshLiveBridge = false }) {
  const liveSnapshot = liveBridgeSnapshot(liveBridge, threadId);
  if (liveSnapshot && (!refreshLiveBridge || !liveSnapshot.ready)) return liveSnapshot;

  let thread;
  try {
    const result = await request("thread/read", {
      threadId,
      includeTurns: true,
    });
    thread = result.thread || result;
  } catch (readError) {
    if (liveSnapshot) return liveSnapshot;
    const result = await request("thread/resume", {
      threadId,
      model,
      cwd: workdir,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    });
    thread = result.thread || result;
  }

  const refreshedSnapshot = snapshotFromThread({ thread, threadId, historyFromThread });
  if (
    liveSnapshot &&
    !refreshedSnapshot.history.length &&
    refreshedSnapshot.history.length <= liveSnapshot.history.length
  ) {
    return liveSnapshot;
  }
  if (liveSnapshot && historySignature(refreshedSnapshot.history) === historySignature(liveSnapshot.history)) return liveSnapshot;
  return refreshedSnapshot;
}

module.exports = {
  findLiveBridge,
  liveBridgeSnapshot,
  liveThreadSummaries,
  readThreadSnapshot,
  snapshotFromThread,
};
