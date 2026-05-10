function bridgeKeyForRequest(threadId, connectionId) {
  if (threadId) return threadId;
  return `new:${connectionId}`;
}

function shouldDisposeIdleBridge({ clientCount }) {
  return clientCount === 0;
}

function shouldPromoteBridgeKey({ bridgeKey, threadId }) {
  return Boolean(threadId && bridgeKey && bridgeKey !== threadId && bridgeKey.startsWith("new:"));
}

module.exports = {
  bridgeKeyForRequest,
  shouldDisposeIdleBridge,
  shouldPromoteBridgeKey,
};
