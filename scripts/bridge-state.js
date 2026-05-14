function bridgeKeyForRequest(threadId, connectionId) {
  if (threadId) return threadId;
  return "new:shared";
}

const defaultRetainedSessionTtlMs = 24 * 60 * 60 * 1000;
const defaultMaxRetainedSessions = 10;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function retentionConfigFromEnv(env = process.env) {
  return {
    idleTtlMs: positiveInteger(env.CODEX_REMOTE_IDLE_TTL_MS, defaultRetainedSessionTtlMs),
    maxSessions: positiveInteger(env.CODEX_REMOTE_MAX_RETAINED_SESSIONS, defaultMaxRetainedSessions),
  };
}

function shouldScheduleIdleCleanup({ clientCount }) {
  return clientCount === 0;
}

function shouldDisposeIdleBridge({ clientCount, idleDeadlineAt = 0, now = Date.now() }) {
  return clientCount === 0 && idleDeadlineAt > 0 && now >= idleDeadlineAt;
}

function shouldPromoteBridgeKey({ bridgeKey, threadId }) {
  return Boolean(threadId && bridgeKey && bridgeKey !== threadId && bridgeKey.startsWith("new:"));
}

module.exports = {
  bridgeKeyForRequest,
  defaultMaxRetainedSessions,
  defaultRetainedSessionTtlMs,
  retentionConfigFromEnv,
  shouldDisposeIdleBridge,
  shouldScheduleIdleCleanup,
  shouldPromoteBridgeKey,
};
