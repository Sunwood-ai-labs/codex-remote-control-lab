const test = require("node:test");
const assert = require("node:assert/strict");

const { isSessionBusy, mergeSessionState, normalizeHookState } = require("./session-state");

test("Codex hook UserPromptSubmit marks the shared session as running", () => {
  const state = normalizeHookState({
    hook_event_name: "UserPromptSubmit",
    session_id: "thread-1",
    turn_id: "turn-1",
    cwd: "/tmp/project",
    prompt: "hello",
  }, 1000);

  assert.equal(state.status, "running");
  assert.equal(state.busy, true);
  assert.equal(state.completed, false);
  assert.equal(state.sessionId, "thread-1");
  assert.equal(state.turnId, "turn-1");
  assert.equal(isSessionBusy(state), true);
});

test("Codex hook PermissionRequest marks the shared session as awaiting approval", () => {
  const state = normalizeHookState({
    hook_event_name: "PermissionRequest",
    session_id: "thread-1",
    turn_id: "turn-1",
    tool_name: "Bash",
  }, 1000);

  assert.equal(state.status, "awaiting_approval");
  assert.equal(state.label, "承認待ち");
  assert.equal(isSessionBusy(state), true);
});

test("Codex hook Stop marks the shared session as input-ready", () => {
  const state = normalizeHookState({
    hook_event_name: "Stop",
    session_id: "thread-1",
    turn_id: "turn-1",
  }, 1000);

  assert.equal(state.status, "input_ready");
  assert.equal(state.busy, false);
  assert.equal(state.completed, true);
  assert.equal(isSessionBusy(state), false);
});

test("session state merge clears busy state after input-ready", () => {
  const running = mergeSessionState(null, {
    status: "running",
    busy: true,
    sessionId: "thread-1",
    updatedAt: 1000,
  });
  const ready = mergeSessionState(running, {
    status: "input_ready",
    label: "入力待ち",
    busy: false,
    completed: true,
    updatedAt: 2000,
  });

  assert.equal(ready.status, "input_ready");
  assert.equal(ready.busy, false);
  assert.equal(ready.completed, true);
});

test("missing session state is treated as not busy", () => {
  assert.equal(isSessionBusy(null), false);
  assert.equal(isSessionBusy(undefined), false);
});

test("hook state keeps cwd so bridge can alias sessions that do not share thread id", () => {
  const state = normalizeHookState({
    hook_event_name: "UserPromptSubmit",
    session_id: "codex-session-id",
    turn_id: "turn-1",
    cwd: "/tmp/project",
  }, 1000);

  assert.equal(state.sessionId, "codex-session-id");
  assert.equal(state.cwd, "/tmp/project");
  assert.equal(state.status, "running");
});
