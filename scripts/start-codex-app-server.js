const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { appServerArgs, appServerListenUrlFromEnv } = require("./codex-app-server-config");

const root = path.resolve(__dirname, "..");
const localCodexBin = path.join(root, "node_modules", ".bin", "codex");
const codexBin = fs.existsSync(localCodexBin) ? localCodexBin : "codex";
const listenUrl = appServerListenUrlFromEnv(process.env);

const child = spawn(codexBin, appServerArgs(listenUrl), {
  cwd: root,
  env: {
    ...process.env,
    PATH: `${path.join(root, "node_modules", ".bin")}:${process.env.PATH || ""}`,
  },
  stdio: "inherit",
});

function forwardSignal(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
