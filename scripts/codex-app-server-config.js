const defaultAppServerPort = 45213;
const goalsFeatureName = "goals";

function appServerListenUrlFromEnv(env = process.env) {
  const explicit = String(env.CODEX_APP_SERVER_LISTEN_URL || "").trim();
  if (explicit) return explicit;
  const parsedPort = Number(env.CODEX_APP_SERVER_PORT || defaultAppServerPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : defaultAppServerPort;
  return `ws://127.0.0.1:${port}`;
}

function appServerArgs(listenUrl) {
  const url = String(listenUrl || "").trim();
  if (!url) throw new Error("listenUrl is required");
  return ["app-server", "--enable", goalsFeatureName, "--listen", url];
}

module.exports = {
  appServerArgs,
  appServerListenUrlFromEnv,
  defaultAppServerPort,
  goalsFeatureName,
};
