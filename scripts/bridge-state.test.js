const test = require("node:test");
const assert = require("node:assert/strict");

const { bridgeKeyForRequest, shouldDisposeIdleBridge, shouldPromoteBridgeKey } = require("./bridge-state");

test("new thread bridge requests get unique non-sticky keys", () => {
  assert.equal(bridgeKeyForRequest("", "a"), "new:a");
  assert.equal(bridgeKeyForRequest(null, "b"), "new:b");
  assert.notEqual(bridgeKeyForRequest("", "a"), bridgeKeyForRequest("", "b"));
});

test("existing thread bridge requests keep the thread id as the shared key", () => {
  assert.equal(bridgeKeyForRequest("thread-123", "ignored"), "thread-123");
});

test("any idle bridge can be disposed when its last browser client leaves", () => {
  assert.equal(shouldDisposeIdleBridge({ clientCount: 0, ready: true }), true);
  assert.equal(shouldDisposeIdleBridge({ clientCount: 1, ready: true }), false);
  assert.equal(shouldDisposeIdleBridge({ clientCount: 0, ready: false }), true);
});

test("new bridge keys promote to the real thread id once ready", () => {
  assert.equal(shouldPromoteBridgeKey({ bridgeKey: "new:a", threadId: "thread-123" }), true);
  assert.equal(shouldPromoteBridgeKey({ bridgeKey: "thread-123", threadId: "thread-123" }), false);
  assert.equal(shouldPromoteBridgeKey({ bridgeKey: "new:a", threadId: "" }), false);
});
