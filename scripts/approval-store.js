function approvalKind(method) {
  if (method === "item/commandExecution/requestApproval") return "commandExecution";
  if (method === "item/fileChange/requestApproval") return "fileChange";
  if (method === "item/permissions/requestApproval") return "permissions";
  if (method === "applyPatchApproval") return "applyPatch";
  if (method === "execCommandApproval") return "execCommand";
  return "unknown";
}

function isApprovalRequest(requestMsg) {
  return (
    requestMsg?.method === "item/commandExecution/requestApproval" ||
    requestMsg?.method === "item/fileChange/requestApproval" ||
    requestMsg?.method === "item/permissions/requestApproval" ||
    requestMsg?.method === "applyPatchApproval" ||
    requestMsg?.method === "execCommandApproval"
  );
}

function approvalResultForDecision(requestMsg, decision, options = {}) {
  const accept = decision === "accept";
  const accepted = options.acceptForSession ? "acceptForSession" : "accept";
  const approved = options.acceptForSession ? "approved_for_session" : "approved";

  if (requestMsg?.method === "item/commandExecution/requestApproval") {
    return { decision: accept ? accepted : "decline" };
  }
  if (requestMsg?.method === "item/fileChange/requestApproval") {
    return { decision: accept ? accepted : "decline" };
  }
  if (requestMsg?.method === "item/permissions/requestApproval") {
    return {
      permissions: accept ? requestMsg.params?.permissions || {} : {},
      scope: accept && options.acceptForSession ? "session" : "turn",
      strictAutoReview: false,
    };
  }
  if (requestMsg?.method === "applyPatchApproval" || requestMsg?.method === "execCommandApproval") {
    return { decision: accept ? approved : "denied" };
  }
  return { decision: accept ? "accept" : "decline" };
}

const EVICT_RESOLVED_AGE_MS = 60_000;

function createApprovalStore() {
  const records = new Map();

  function evictResolved() {
    const cutoff = Date.now() - EVICT_RESOLVED_AGE_MS;
    for (const [approvalId, record] of records.entries()) {
      if (record.status !== "pending" && record.resolvedAt && record.resolvedAt < cutoff) {
        records.delete(approvalId);
      }
    }
  }

  function register({ bridgeKey, threadId, turnId, request }) {
    if (request?.id === undefined || request?.id === null || !request?.method) return null;
    const approvalId = `${bridgeKey || threadId || "bridge"}:${request.id}`;
    const existing = records.get(approvalId);
    if (existing?.status === "pending") return existing;
    const record = {
      approvalId,
      bridgeKey,
      threadId: threadId || null,
      turnId: turnId || null,
      method: request.method,
      kind: approvalKind(request.method),
      params: request.params || {},
      request,
      status: "pending",
      createdAt: Date.now(),
      resolvedAt: null,
      decision: null,
    };
    records.set(approvalId, record);
    return record;
  }

  function list(filter = {}) {
    evictResolved();
    return Array.from(records.values()).filter((record) => {
      if (filter.status && record.status !== filter.status) return false;
      if (filter.bridgeKey && record.bridgeKey !== filter.bridgeKey) return false;
      if (filter.threadId && record.threadId !== filter.threadId) return false;
      return true;
    });
  }

  function resolveDetailed(approvalId, decision) {
    const record = records.get(approvalId);
    if (!record) return { status: "missing", record: null };
    if (record.status !== "pending") return { status: "already-resolved", record };
    record.status = decision === "accept" ? "accepted" : "declined";
    record.decision = decision === "accept" ? "accept" : "decline";
    record.resolvedAt = Date.now();
    return { status: "resolved", record };
  }

  function resolve(approvalId, decision) {
    evictResolved();
    const result = resolveDetailed(approvalId, decision);
    return result.status === "resolved" ? result.record : null;
  }

  function clearForBridge(bridgeKey, status = "closed") {
    for (const record of records.values()) {
      if (record.bridgeKey === bridgeKey && record.status === "pending") {
        record.status = status;
        record.resolvedAt = Date.now();
      }
    }
  }

  return { register, list, resolve, resolveDetailed, clearForBridge };
}

function approvalRecordForClient(record) {
  if (!record) return null;
  return {
    approvalId: record.approvalId,
    threadId: record.threadId,
    turnId: record.turnId,
    method: record.method,
    kind: record.kind,
    params: record.params,
    createdAt: record.createdAt,
  };
}

module.exports = {
  approvalKind,
  approvalRecordForClient,
  approvalResultForDecision,
  createApprovalStore,
  isApprovalRequest,
  EVICT_RESOLVED_AGE_MS,
};
