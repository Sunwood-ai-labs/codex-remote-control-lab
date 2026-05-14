const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bridgeKeyForRequest,
  defaultRetainedSessionTtlMs,
  retentionConfigFromEnv,
  shouldDisposeIdleBridge,
  shouldScheduleIdleCleanup,
  shouldPromoteBridgeKey,
} = require("./bridge-state");

test("new thread bridge requests share the startup URL bridge", () => {
  assert.equal(bridgeKeyForRequest("", "a"), "new:shared");
  assert.equal(bridgeKeyForRequest(null, "b"), "new:shared");
  assert.equal(bridgeKeyForRequest("", "a"), bridgeKeyForRequest("", "b"));
});

test("existing thread bridge requests keep the thread id as the shared key", () => {
  assert.equal(bridgeKeyForRequest("thread-123", "ignored"), "thread-123");
});

test("idle bridge cleanup is delayed until the retention deadline", () => {
  assert.equal(shouldScheduleIdleCleanup({ clientCount: 0 }), true);
  assert.equal(shouldScheduleIdleCleanup({ clientCount: 1 }), false);
  assert.equal(shouldDisposeIdleBridge({ clientCount: 0, idleDeadlineAt: 2000, now: 1999 }), false);
  assert.equal(shouldDisposeIdleBridge({ clientCount: 0, idleDeadlineAt: 2000, now: 2000 }), true);
  assert.equal(shouldDisposeIdleBridge({ clientCount: 1, idleDeadlineAt: 2000, now: 3000 }), false);
});

test("new bridge keys promote to the real thread id once ready", () => {
  assert.equal(shouldPromoteBridgeKey({ bridgeKey: "new:a", threadId: "thread-123" }), true);
  assert.equal(shouldPromoteBridgeKey({ bridgeKey: "thread-123", threadId: "thread-123" }), false);
  assert.equal(shouldPromoteBridgeKey({ bridgeKey: "new:a", threadId: "" }), false);
});

test("retained session config defaults to 24 hours and 10 sessions", () => {
  assert.deepEqual(retentionConfigFromEnv({}), {
    idleTtlMs: defaultRetainedSessionTtlMs,
    maxSessions: 10,
  });
  assert.deepEqual(
    retentionConfigFromEnv({
      CODEX_REMOTE_IDLE_TTL_MS: "5000",
      CODEX_REMOTE_MAX_RETAINED_SESSIONS: "12",
    }),
    {
      idleTtlMs: 5000,
      maxSessions: 12,
    },
  );
});
