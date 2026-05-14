const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { appServerArgs, appServerListenUrlFromEnv } = require("./codex-app-server-config");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("app server args always enable the goals feature", () => {
  assert.deepEqual(appServerArgs("ws://127.0.0.1:45213"), [
    "app-server",
    "--enable",
    "goals",
    "--listen",
    "ws://127.0.0.1:45213",
  ]);
});

test("app server listen URL defaults to localhost port 45213", () => {
  assert.equal(appServerListenUrlFromEnv({}), "ws://127.0.0.1:45213");
  assert.equal(appServerListenUrlFromEnv({ CODEX_APP_SERVER_PORT: "45555" }), "ws://127.0.0.1:45555");
  assert.equal(appServerListenUrlFromEnv({ CODEX_APP_SERVER_LISTEN_URL: "ws://127.0.0.1:46666" }), "ws://127.0.0.1:46666");
});

test("public startup contracts use the shared app-server entrypoint", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["server:ws"], "node scripts/start-codex-app-server.js");
  assert.match(read("ops/launchd/com.sunwood.codex-remote-control-lab.codex.plist"), /node scripts\/start-codex-app-server\.js/);
  assert.match(read("scripts/start-phone.js"), /appServerArgs\(codexUrl\)/);
});
