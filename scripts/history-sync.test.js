const test = require("node:test");
const assert = require("node:assert/strict");

const { historySyncRequests, isHistorySyncEnabled, runHistorySync } = require("./history-sync");

test("history sync is enabled by default", () => {
  assert.equal(isHistorySyncEnabled({}), true);
});

test("history sync can be disabled with common falsey env values", () => {
  for (const value of ["0", "false", "off", "no", "FALSE"]) {
    assert.equal(isHistorySyncEnabled({ CODEX_HISTORY_SYNC: value }), false);
  }
});

test("historySyncRequests warms thread body and scan-backed list metadata", () => {
  assert.deepEqual(historySyncRequests("thread-123", "/tmp/demo", 10), [
    {
      method: "thread/read",
      params: { threadId: "thread-123", includeTurns: true },
    },
    {
      method: "thread/list",
      params: {
        limit: 10,
        sortKey: "updated_at",
        sortDirection: "desc",
        archived: false,
        cwd: "/tmp/demo",
        useStateDbOnly: false,
      },
    },
  ]);
});

test("runHistorySync calls requests in order", async () => {
  const calls = [];
  const result = await runHistorySync({
    threadId: "thread-123",
    workdir: "/tmp/demo",
    request: async (method, params) => {
      calls.push({ method, params });
      return { ok: method };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["thread/read", "thread/list"],
  );
});

test("runHistorySync skips without a thread or when disabled", async () => {
  let calls = 0;
  const request = async () => {
    calls += 1;
  };

  assert.deepEqual(await runHistorySync({ threadId: "", workdir: "/tmp/demo", request }), {
    ok: true,
    skipped: true,
    results: [],
  });
  assert.deepEqual(await runHistorySync({ threadId: "thread-123", workdir: "/tmp/demo", request, enabled: false }), {
    ok: true,
    skipped: true,
    results: [],
  });
  assert.equal(calls, 0);
});
