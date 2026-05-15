const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("chat stream only auto-scrolls when the log is already near the bottom", () => {
  const main = read("public/main.js");

  assert.match(main, /const logAutoScrollThresholdPx = 72;/);
  assert.match(main, /function shouldAutoScrollLog\(\)/);
  assert.match(main, /function scrollLogToBottomIfNeeded\(shouldScroll = shouldAutoScrollLog\(\)\)/);
  assert.equal((main.match(/log\.scrollTop = log\.scrollHeight;/g) || []).length, 1);

  assert.match(
    main,
    /function addStatusGroupItem\(text\) \{\s+const shouldStickToBottom = shouldAutoScrollLog\(\);[\s\S]*scrollLogToBottomIfNeeded\(shouldStickToBottom\);/,
  );
  assert.match(
    main,
    /function addEntry\(kind, text, images = \[\]\) \{[\s\S]*const shouldStickToBottom = shouldAutoScrollLog\(\);[\s\S]*log\.appendChild\(el\);\s+scrollLogToBottomIfNeeded\(shouldStickToBottom\);/,
  );
  assert.match(
    main,
    /if \(msg\.type === "assistantDelta"\) \{[\s\S]*const shouldStickToBottom = shouldAutoScrollLog\(\);[\s\S]*setEntryText\(assistantEntry, "assistant"[\s\S]*scrollLogToBottomIfNeeded\(shouldStickToBottom\);/,
  );
});
