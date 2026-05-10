function isHistorySyncEnabled(env = process.env) {
  const value = String(env.CODEX_HISTORY_SYNC || "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(value);
}

function historySyncRequests(threadId, workdir, limit = 30) {
  if (!threadId) return [];
  return [
    {
      method: "thread/read",
      params: {
        threadId,
        includeTurns: true,
      },
    },
    {
      method: "thread/list",
      params: {
        limit,
        sortKey: "updated_at",
        sortDirection: "desc",
        archived: false,
        cwd: workdir,
        useStateDbOnly: false,
      },
    },
  ];
}

async function runHistorySync({ threadId, workdir, request, enabled = true, limit = 30 }) {
  if (!enabled || !threadId) return { ok: true, skipped: true, results: [] };
  const results = [];
  for (const item of historySyncRequests(threadId, workdir, limit)) {
    const result = await request(item.method, item.params);
    results.push({ method: item.method, result });
  }
  return { ok: true, skipped: false, results };
}

module.exports = {
  historySyncRequests,
  isHistorySyncEnabled,
  runHistorySync,
};
