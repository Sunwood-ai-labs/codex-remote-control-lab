const fs = require("node:fs");

function payloadText(payload) {
  const content = payload?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part) return "";
      if (typeof part === "string") return part;
      return part.text || part.input_text || part.output_text || "";
    })
    .filter(Boolean)
    .join("\n");
}

function commandText(payload) {
  if (payload?.type !== "function_call") return "";
  if (!payload.name) return "";
  if (payload.name !== "exec_command") return "";
  try {
    const args = JSON.parse(payload.arguments || "{}");
    return args.cmd ? `$ ${args.cmd}` : "";
  } catch {
    return "";
  }
}

function pushDeduped(history, entry) {
  if (!entry?.text) return;
  const text = String(entry.text).trim();
  if (!text) return;
  const previous = history[history.length - 1];
  if (previous?.type === entry.type && previous?.text === text) return;
  history.push({ ...entry, text });
}

function entryFromJsonlRecord(record) {
  const payload = record?.payload || {};
  if (record.type === "event_msg" && payload.type === "user_message") {
    return { type: "user", text: payload.message || "" };
  }
  if (record.type === "event_msg" && payload.type === "agent_message") {
    return { type: "assistant", text: payload.message || "" };
  }
  if (record.type === "response_item" && payload.type === "function_call") {
    return { type: "status", text: commandText(payload) };
  }
  if (record.type === "response_item" && payload.type === "message" && payload.role === "assistant") {
    return { type: "assistant", text: payloadText(payload) };
  }
  return null;
}

function parseSessionJsonlHistory(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const limit = Number(options.limit || 80);
  const history = [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    pushDeduped(history, entryFromJsonlRecord(record));
  }

  return history.slice(-limit);
}

function sessionHistoryFromThread(thread, options = {}) {
  return parseSessionJsonlHistory(thread?.path, options);
}

module.exports = {
  entryFromJsonlRecord,
  parseSessionJsonlHistory,
  sessionHistoryFromThread,
};
