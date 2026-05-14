const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseSessionJsonlHistory } = require("./session-jsonl-history");

function writeTempJsonl(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-session-history-"));
  const file = path.join(dir, "rollout-test-thread.jsonl");
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n"));
  return file;
}

test("parseSessionJsonlHistory reads user and assistant event messages", () => {
  const file = writeTempJsonl([
    { type: "response_item", payload: { type: "message", role: "user", content: [{ text: "# AGENTS.md instructions" }] } },
    { type: "event_msg", payload: { type: "user_message", message: "何が確認できた？？" } },
    { type: "event_msg", payload: { type: "agent_message", message: "テストが通ったことを確認しました。" } },
  ]);

  assert.deepEqual(parseSessionJsonlHistory(file), [
    { type: "user", text: "何が確認できた？？" },
    { type: "assistant", text: "テストが通ったことを確認しました。" },
  ]);
});

test("parseSessionJsonlHistory includes command status without duplicating assistant text", () => {
  const file = writeTempJsonl([
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: "npm run test" }),
      },
    },
    { type: "event_msg", payload: { type: "agent_message", message: "テストを実行します。" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "テストを実行します。" }] } },
  ]);

  assert.deepEqual(parseSessionJsonlHistory(file), [
    { type: "status", text: "$ npm run test" },
    { type: "assistant", text: "テストを実行します。" },
  ]);
});
