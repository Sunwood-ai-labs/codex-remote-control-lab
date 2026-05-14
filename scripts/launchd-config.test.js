const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const launchdDir = path.join(root, "ops", "launchd");
const phonePlist = fs.readFileSync(path.join(launchdDir, "com.example.codex-remote-control-lab.phone.plist.example"), "utf8");
const codexPlist = fs.readFileSync(path.join(launchdDir, "com.example.codex-remote-control-lab.codex.plist.example"), "utf8");

test("launchd examples keep app-server and phone bridge lifecycles separate", () => {
  assert.match(codexPlist, /com\.example\.codex-remote-control-lab\.codex/);
  assert.match(codexPlist, /codex app-server --listen ws:\/\/127\.0\.0\.1:45213/);
  assert.doesNotMatch(codexPlist, /CODEX_REMOTE_CONTROL_LAB_ROOT/);
  assert.doesNotMatch(codexPlist, /cd "\$CODEX_REMOTE_CONTROL_LAB_ROOT"/);
  assert.match(phonePlist, /com\.example\.codex-remote-control-lab\.phone/);
  assert.match(phonePlist, /CODEX_APP_SERVER_URL/);
  assert.match(phonePlist, /ws:\/\/127\.0\.0\.1:45213/);
  assert.doesNotMatch(phonePlist, /CODEX_APP_SERVER_PORT/);
});

test("launchd examples use the same shell wrapper strategy", () => {
  for (const plist of [phonePlist, codexPlist]) {
    assert.match(plist, /<string>\/bin\/zsh<\/string>/);
    assert.match(plist, /<string>-lc<\/string>/);
  }
  assert.match(phonePlist, /npm run phone/);
});

test("launchd examples use placeholders instead of machine-specific local paths", () => {
  for (const plist of [phonePlist, codexPlist]) {
    assert.match(plist, /&lt;repo-root&gt;/);
    assert.match(plist, /&lt;log-dir&gt;/);
    assert.doesNotMatch(plist, /\/Users\//);
    assert.doesNotMatch(plist, /Library\/LaunchAgents/);
    assert.doesNotMatch(plist, /\.logs\//);
  }
});
