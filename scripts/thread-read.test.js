const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { findLiveBridge, liveBridgeSnapshot, liveThreadSummaries, readThreadSnapshot } = require("./thread-read");

function writeTempJsonl(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-thread-read-"));
  const file = path.join(dir, "rollout-test-thread.jsonl");
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n"));
  return file;
}

test("liveBridgeSnapshot returns ready in-memory bridge history", () => {
  assert.deepEqual(
    liveBridgeSnapshot(
      {
        ready: true,
        threadId: "thread-123",
        history: [{ type: "status", text: "ready" }],
      },
      "thread-123",
    ),
    {
      threadId: "thread-123",
      ready: true,
      history: [{ type: "status", text: "ready" }],
      source: "live-bridge",
    },
  );
});

test("findLiveBridge finds bridges by promoted thread id", () => {
  const bridge = { threadId: "thread-123", requestedThreadId: null };
  const bridges = new Map([["thread-123", bridge]]);

  assert.equal(findLiveBridge(bridges, "thread-123"), bridge);
});

test("findLiveBridge finds starting bridges by requested thread id", () => {
  const bridge = { threadId: null, requestedThreadId: "thread-123" };
  const bridges = new Map([["connection-temp-key", bridge]]);

  assert.equal(findLiveBridge(bridges, "thread-123"), bridge);
});

test("liveThreadSummaries returns only active bridge sessions", () => {
  const bridges = new Map([
    [
      "thread-live",
      {
        threadId: "thread-live",
        requestedThreadId: null,
        cwd: "/tmp/project-a",
        ready: true,
        clients: new Set(["browser"]),
        history: [{ type: "user", text: "hello live thread" }],
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    [
      "thread-failed",
      {
        threadId: null,
        requestedThreadId: "thread-failed",
        cwd: "/tmp/project-b",
        ready: false,
        startupFailed: true,
        clients: new Set(),
        history: [],
      },
    ],
  ]);

  const summaries = liveThreadSummaries(bridges, {
    now: 3000,
    sessionStateFor: (threadId) => (threadId === "thread-live" ? { status: "running", updatedAt: 2500 } : null),
  });

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, "thread-live");
  assert.equal(summaries[0].cwd, "/tmp/project-a");
  assert.equal(summaries[0].preview, "hello live thread");
  assert.equal(summaries[0].clients, 1);
  assert.equal(summaries[0].status, "running");
  assert.equal(summaries[0].updatedAt, 2500);
});

test("liveThreadSummaries excludes retained bridges without connected clients", () => {
  const bridges = new Map([
    [
      "thread-retained",
      {
        threadId: "thread-retained",
        requestedThreadId: null,
        cwd: "/tmp/project-a",
        ready: true,
        clients: new Set(),
        history: [{ type: "user", text: "retained thread" }],
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
  ]);

  const summaries = liveThreadSummaries(bridges, { now: 3000 });

  assert.equal(summaries.length, 0);
});

test("liveThreadSummaries includes starting non-failed bridge sessions", () => {
  const bridges = new Map([
    [
      "connection-key",
      {
        threadId: null,
        requestedThreadId: "thread-starting",
        cwd: "/tmp/project-a",
        ready: false,
        clients: new Set(["browser"]),
        history: [],
        createdAt: 1000,
      },
    ],
  ]);

  const summaries = liveThreadSummaries(bridges, { now: 3000 });

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, "thread-starting");
  assert.equal(summaries[0].preview, "起動中");
  assert.equal(summaries[0].status, "starting");
});

test("readThreadSnapshot does not call app-server for a live bridge thread", async () => {
  let calls = 0;
  const snapshot = await readThreadSnapshot({
    threadId: "thread-123",
    liveBridge: {
      ready: true,
      threadId: "thread-123",
      history: [{ type: "assistant", text: "hello" }],
    },
    request: async () => {
      calls += 1;
      throw new Error("should not call app-server");
    },
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [],
  });

  assert.equal(calls, 0);
  assert.equal(snapshot.source, "live-bridge");
  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.history, [{ type: "assistant", text: "hello" }]);
});

test("readThreadSnapshot can refresh a ready live bridge from session jsonl", async () => {
  const file = writeTempJsonl([
    { type: "event_msg", payload: { type: "user_message", message: "何が確認できた？？" } },
    { type: "event_msg", payload: { type: "agent_message", message: "テスト結果を確認しました。" } },
  ]);
  const calls = [];
  const snapshot = await readThreadSnapshot({
    threadId: "thread-123",
    liveBridge: {
      ready: true,
      threadId: "thread-123",
      history: [{ type: "user", text: "ハロー" }],
    },
    request: async (method, params) => {
      calls.push({ method, params });
      return { thread: { id: "thread-123", path: file, turns: [] } };
    },
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [],
    refreshLiveBridge: true,
  });

  assert.deepEqual(calls.map((call) => call.method), ["thread/read"]);
  assert.equal(snapshot.source, "session-jsonl");
  assert.deepEqual(snapshot.history, [
    { type: "user", text: "何が確認できた？？" },
    { type: "assistant", text: "テスト結果を確認しました。" },
  ]);
});

test("readThreadSnapshot preserves live history when refreshed session history is shorter", async () => {
  const file = writeTempJsonl([
    { type: "event_msg", payload: { type: "user_message", message: "short persisted history" } },
  ]);
  const snapshot = await readThreadSnapshot({
    threadId: "thread-123",
    liveBridge: {
      ready: true,
      threadId: "thread-123",
      history: [
        { type: "user", text: "live question" },
        { type: "assistant", text: "live answer" },
      ],
    },
    request: async () => ({ thread: { id: "thread-123", path: file, turns: [] } }),
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [],
    refreshLiveBridge: true,
  });

  assert.equal(snapshot.source, "live-bridge");
  assert.deepEqual(snapshot.history, [
    { type: "user", text: "live question" },
    { type: "assistant", text: "live answer" },
  ]);
});

test("readThreadSnapshot does not call app-server while an existing bridge is still starting", async () => {
  let calls = 0;
  const snapshot = await readThreadSnapshot({
    threadId: "thread-123",
    liveBridge: {
      ready: false,
      requestedThreadId: "thread-123",
      threadId: null,
      history: [],
    },
    request: async () => {
      calls += 1;
      throw new Error("should not call app-server while bridge is starting");
    },
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [],
  });

  assert.equal(calls, 0);
  assert.equal(snapshot.source, "live-bridge");
  assert.equal(snapshot.ready, false);
  assert.deepEqual(snapshot.history, []);
});

test("readThreadSnapshot falls back when a matching bridge failed to resume", async () => {
  const calls = [];
  const snapshot = await readThreadSnapshot({
    threadId: "thread-123",
    liveBridge: {
      ready: false,
      startupFailed: true,
      requestedThreadId: "thread-123",
      threadId: null,
      history: [],
    },
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") throw new Error("stale cache");
      return { thread: { id: "thread-123", turns: [] } };
    },
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [{ type: "status", text: "resumed" }],
  });

  assert.deepEqual(calls.map((call) => call.method), ["thread/read", "thread/resume"]);
  assert.equal(snapshot.source, "app-server");
  assert.deepEqual(snapshot.history, [{ type: "status", text: "resumed" }]);
});

test("readThreadSnapshot falls back from thread/read to thread/resume for non-live threads", async () => {
  const calls = [];
  const snapshot = await readThreadSnapshot({
    threadId: "thread-456",
    liveBridge: null,
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") throw new Error("no rollout found");
      return { thread: { id: "thread-456", items: [] } };
    },
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [{ type: "status", text: "loaded" }],
  });

  assert.deepEqual(calls.map((call) => call.method), ["thread/read", "thread/resume"]);
  assert.equal(calls[1].params.cwd, "/tmp/user-project");
  assert.equal(snapshot.source, "app-server");
  assert.deepEqual(snapshot.history, [{ type: "status", text: "loaded" }]);
});

test("readThreadSnapshot falls back when upstream disconnects before startup RPC returns", async () => {
  // bridge is still starting (ready:false) but socket dropped before thread/start RPC returned
  // startupFailed should be true (set by upstream close/error handler while !ready)
  const calls = [];
  const snapshot = await readThreadSnapshot({
    threadId: "thread-123",
    liveBridge: {
      ready: false,
      startupFailed: true,
      requestedThreadId: "thread-123",
      threadId: null,
      history: [],
    },
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") throw new Error("not found");
      return { thread: { id: "thread-123", turns: [] } };
    },
    model: "gpt-5.4",
    workdir: "/tmp/user-project",
    historyFromThread: () => [{ type: "status", text: "reconnected" }],
  });

  assert.deepEqual(calls.map((c) => c.method), ["thread/read", "thread/resume"]);
  assert.equal(snapshot.source, "app-server");
  assert.deepEqual(snapshot.history, [{ type: "status", text: "reconnected" }]);
});
