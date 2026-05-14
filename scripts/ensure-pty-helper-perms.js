const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const prebuildsDir = path.join(root, "node_modules", "node-pty", "prebuilds");

if (!fs.existsSync(prebuildsDir)) process.exit(0);

for (const platformDir of fs.readdirSync(prebuildsDir)) {
  const helper = path.join(prebuildsDir, platformDir, "spawn-helper");
  if (!fs.existsSync(helper)) continue;
  const stat = fs.statSync(helper);
  fs.chmodSync(helper, stat.mode | 0o755);
}
