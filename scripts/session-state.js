const RUNNING_EVENTS = new Set(["UserPromptSubmit", "PreToolUse", "PostToolUse"]);

function eventName(payload = {}) {
  return String(payload.hook_event_name || payload.event || payload.type || "");
}

function sessionIdFromHook(payload = {}) {
  return String(payload.session_id || payload.thread_id || payload.sessionId || payload.threadId || "");
}

function normalizeHookState(payload = {}, now = Date.now()) {
  const event = eventName(payload);
  const sessionId = sessionIdFromHook(payload);
  const turnId = payload.turn_id || payload.turnId || null;
  const cwd = payload.cwd || null;
  const toolName = payload.tool_name || null;

  let status = "unknown";
  let label = "Codex 状態を更新しました";
  let busy = false;
  let completed = false;

  if (event === "UserPromptSubmit") {
    status = "running";
    label = "Codex 処理中";
    busy = true;
  } else if (event === "PermissionRequest") {
    status = "awaiting_approval";
    label = "承認待ち";
    busy = true;
  } else if (event === "Stop") {
    status = "input_ready";
    label = "入力待ち";
    completed = true;
  } else if (RUNNING_EVENTS.has(event)) {
    status = "running";
    label = toolName ? `${toolName} 実行中` : "Codex 処理中";
    busy = true;
  }

  return {
    source: "codex-hook",
    status,
    label,
    busy,
    completed,
    sessionId,
    turnId,
    cwd,
    event,
    toolName,
    updatedAt: now,
  };
}

function mergeSessionState(previous = {}, patch = {}) {
  const next = {
    ...previous,
    ...patch,
    updatedAt: patch.updatedAt || Date.now(),
  };
  next.busy = next.status === "running" || next.status === "awaiting_approval" || Boolean(next.busy && next.status !== "input_ready");
  next.completed = next.status === "input_ready" || next.status === "completed" || Boolean(next.completed);
  return next;
}

function isSessionBusy(state = {}) {
  if (!state) return false;
  return state.status === "running" || state.status === "awaiting_approval" || Boolean(state.busy);
}

module.exports = {
  eventName,
  isSessionBusy,
  mergeSessionState,
  normalizeHookState,
  sessionIdFromHook,
};
