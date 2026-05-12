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

async function readThreadSnapshot({ threadId, liveBridge, request, model, workdir, historyFromThread }) {
  const liveSnapshot = liveBridgeSnapshot(liveBridge, threadId);
  if (liveSnapshot) return liveSnapshot;

  let thread;
  try {
    const result = await request("thread/read", {
      threadId,
      includeTurns: true,
    });
    thread = result.thread || result;
  } catch (readError) {
    const result = await request("thread/resume", {
      threadId,
      model,
      cwd: workdir,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    });
    thread = result.thread || result;
  }

  return {
    threadId: thread.id || threadId,
    history: historyFromThread(thread),
    source: "app-server",
  };
}

module.exports = {
  findLiveBridge,
  liveBridgeSnapshot,
  readThreadSnapshot,
};
