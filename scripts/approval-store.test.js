const test = require("node:test");
const assert = require("node:assert/strict");

const { approvalKind, approvalRecordForClient, approvalResultForDecision, createApprovalStore, isApprovalRequest, EVICT_RESOLVED_AGE_MS } = require("./approval-store");

test("approvalKind classifies Codex approval methods", () => {
  assert.equal(approvalKind("item/commandExecution/requestApproval"), "commandExecution");
  assert.equal(approvalKind("item/fileChange/requestApproval"), "fileChange");
  assert.equal(approvalKind("item/permissions/requestApproval"), "permissions");
  assert.equal(approvalKind("applyPatchApproval"), "applyPatch");
  assert.equal(approvalKind("execCommandApproval"), "execCommand");
  assert.equal(approvalKind("other/requestApproval"), "unknown");
});

test("isApprovalRequest covers current and legacy Codex approval callbacks", () => {
  assert.equal(isApprovalRequest({ method: "item/commandExecution/requestApproval" }), true);
  assert.equal(isApprovalRequest({ method: "item/fileChange/requestApproval" }), true);
  assert.equal(isApprovalRequest({ method: "item/permissions/requestApproval" }), true);
  assert.equal(isApprovalRequest({ method: "applyPatchApproval" }), true);
  assert.equal(isApprovalRequest({ method: "execCommandApproval" }), true);
  assert.equal(isApprovalRequest({ method: "item/tool/requestUserInput" }), false);
});

test("approval store registers pending approvals with a stable client shape", () => {
  const store = createApprovalStore();
  const record = store.register({
    bridgeKey: "thread-123",
    threadId: "thread-123",
    turnId: "turn-1",
    request: { id: 7, method: "item/commandExecution/requestApproval", params: { command: "date" } },
  });

  assert.equal(record.approvalId, "thread-123:7");
  assert.equal(record.status, "pending");
  assert.deepEqual(approvalRecordForClient(record), {
    approvalId: "thread-123:7",
    threadId: "thread-123",
    turnId: "turn-1",
    method: "item/commandExecution/requestApproval",
    kind: "commandExecution",
    params: { command: "date" },
    createdAt: record.createdAt,
  });
});

test("approval store keeps request id zero valid", () => {
  const store = createApprovalStore();
  const record = store.register({
    bridgeKey: "thread-123",
    threadId: "thread-123",
    turnId: "turn-1",
    request: { id: 0, method: "item/fileChange/requestApproval", params: { path: "README.md" } },
  });

  assert.equal(record.approvalId, "thread-123:0");
});

test("approval store resolves a pending approval exactly once", () => {
  const store = createApprovalStore();
  store.register({
    bridgeKey: "thread-123",
    threadId: "thread-123",
    turnId: "turn-1",
    request: { id: 7, method: "item/fileChange/requestApproval", params: { path: "README.md" } },
  });

  const accepted = store.resolve("thread-123:7", "accept");
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.decision, "accept");
  assert.equal(store.resolve("thread-123:7", "decline"), null);
  assert.equal(store.resolveDetailed("thread-123:7", "decline").status, "already-resolved");
  assert.equal(store.resolveDetailed("thread-123:missing", "accept").status, "missing");
});

test("approval store clears pending approvals for a bridge", () => {
  const store = createApprovalStore();
  store.register({
    bridgeKey: "thread-123",
    threadId: "thread-123",
    turnId: "turn-1",
    request: { id: 7, method: "item/fileChange/requestApproval", params: { path: "README.md" } },
  });

  store.clearForBridge("thread-123", "interrupted");
  assert.equal(store.list({ status: "pending", bridgeKey: "thread-123" }).length, 0);
  assert.equal(store.resolveDetailed("thread-123:7", "accept").status, "already-resolved");
});

test("approvalResultForDecision preserves Codex accept decline payloads", () => {
  assert.deepEqual(approvalResultForDecision({ method: "item/commandExecution/requestApproval" }, "accept"), { decision: "accept" });
  assert.deepEqual(approvalResultForDecision({ method: "item/commandExecution/requestApproval" }, "accept", { acceptForSession: true }), {
    decision: "acceptForSession",
  });
  assert.deepEqual(approvalResultForDecision({ method: "item/fileChange/requestApproval" }, "decline"), { decision: "decline" });
  assert.deepEqual(
    approvalResultForDecision(
      { method: "item/permissions/requestApproval", params: { permissions: { network: { enabled: true }, fileSystem: null } } },
      "accept",
      { acceptForSession: true },
    ),
    { permissions: { network: { enabled: true }, fileSystem: null }, scope: "session", strictAutoReview: false },
  );
  assert.deepEqual(approvalResultForDecision({ method: "execCommandApproval" }, "accept", { acceptForSession: true }), {
    decision: "approved_for_session",
  });
});

test("approval store evicts resolved approvals older than threshold", () => {
  const store = createApprovalStore();
  const pendingRecord = store.register({
    bridgeKey: "thread-123",
    threadId: "thread-123",
    turnId: "turn-1",
    request: { id: 1, method: "item/commandExecution/requestApproval", params: { command: "echo pending" } },
  });
  const resolvedRecord = store.register({
    bridgeKey: "thread-123",
    threadId: "thread-123",
    turnId: "turn-1",
    request: { id: 2, method: "item/fileChange/requestApproval", params: { path: "README.md" } },
  });

  store.resolve("thread-123:2", "accept");

  const beforeList = store.list();
  assert.equal(beforeList.length, 2);

  resolvedRecord.resolvedAt = Date.now() - EVICT_RESOLVED_AGE_MS - 1000;

  const afterList = store.list();
  assert.equal(afterList.length, 1);
  assert.equal(afterList[0].approvalId, "thread-123:1");
  assert.equal(afterList[0].status, "pending");
});
