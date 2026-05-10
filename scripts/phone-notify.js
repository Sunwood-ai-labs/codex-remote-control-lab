function bridgeUrls(addresses, uiPort, phoneToken) {
  return addresses.map((address) => `http://${address}:${uiPort}/?token=${phoneToken}`);
}

function envValue(env, key) {
  const value = env[key];
  return value && String(value).trim();
}

function ntfyConfig(env) {
  const topic = envValue(env, "PHONE_NTFY_TOPIC");
  if (!topic) return null;
  const server = envValue(env, "PHONE_NTFY_SERVER") || "https://ntfy.sh";
  return {
    type: "ntfy",
    server: server.replace(/\/+$/, ""),
    topic,
    token: envValue(env, "PHONE_NTFY_TOKEN"),
  };
}

function pushoverConfig(env) {
  const token = envValue(env, "PHONE_PUSHOVER_TOKEN");
  const user = envValue(env, "PHONE_PUSHOVER_USER");
  if (!token || !user) return null;
  return {
    type: "pushover",
    token,
    user,
    device: envValue(env, "PHONE_PUSHOVER_DEVICE"),
  };
}

function discordConfig(env) {
  const webhookUrl = envValue(env, "PHONE_DISCORD_WEBHOOK_URL");
  if (!webhookUrl) return null;
  return {
    type: "discord",
    webhookUrl,
  };
}

function notificationTargets(env = process.env) {
  return [ntfyConfig(env), pushoverConfig(env), discordConfig(env)].filter(Boolean);
}

function notificationTimeoutMs(env = process.env) {
  const value = Number(envValue(env, "PHONE_NOTIFY_TIMEOUT_MS") || 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

function notificationMessage(urls) {
  const visibleUrls = urls.length ? urls : ["No LAN URL was detected. Check the bridge console on the host."];
  return [
    "Codex phone bridge is ready.",
    "",
    ...visibleUrls,
    "",
    "Open one of these URLs from a phone on the same Wi-Fi/LAN.",
  ].join("\n");
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function ntfyEndpoint(target) {
  const server = new URL(`${target.server}/`);
  if (server.protocol !== "https:") throw new Error("PHONE_NTFY_SERVER must use https");
  return new URL(encodeURIComponent(target.topic), server).toString();
}

async function postNtfy(target, urls, fetchImpl, timeoutMs) {
  const headers = {
    title: "Codex phone bridge ready",
    tags: "computer,phone",
  };
  if (urls[0]) headers.click = urls[0];
  if (target.token) headers.authorization = `Bearer ${target.token}`;
  const response = await fetchWithTimeout(fetchImpl, ntfyEndpoint(target), {
    method: "POST",
    headers,
    body: notificationMessage(urls),
  }, timeoutMs);
  if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`);
}

async function postPushover(target, urls, fetchImpl, timeoutMs) {
  const form = new URLSearchParams({
    token: target.token,
    user: target.user,
    title: "Codex phone bridge ready",
    message: notificationMessage(urls),
  });
  if (urls[0]) {
    form.set("url", urls[0]);
    form.set("url_title", "Open Codex phone bridge");
  }
  if (target.device) form.set("device", target.device);
  const response = await fetchWithTimeout(fetchImpl, "https://api.pushover.net/1/messages.json", {
    method: "POST",
    body: form,
  }, timeoutMs);
  if (!response.ok) throw new Error(`Pushover returned HTTP ${response.status}`);
}

function discordEndpoint(target) {
  const url = new URL(target.webhookUrl);
  const allowedHosts = new Set(["discord.com", "discordapp.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || !url.pathname.startsWith("/api/webhooks/")) {
    throw new Error("PHONE_DISCORD_WEBHOOK_URL must be a Discord https webhook URL");
  }
  return url.toString();
}

async function postDiscord(target, urls, fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, discordEndpoint(target), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: notificationMessage(urls),
      allowed_mentions: { parse: [] },
    }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
}

async function notifyBridgeUrls(urls, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const targets = notificationTargets(env);
  const timeoutMs = notificationTimeoutMs(env);
  const results = [];

  for (const target of targets) {
    try {
      if (target.type === "ntfy") await postNtfy(target, urls, fetchImpl, timeoutMs);
      if (target.type === "pushover") await postPushover(target, urls, fetchImpl, timeoutMs);
      if (target.type === "discord") await postDiscord(target, urls, fetchImpl, timeoutMs);
      results.push({ type: target.type, ok: true });
    } catch (error) {
      results.push({ type: target.type, ok: false, error: error.message });
    }
  }

  return results;
}

module.exports = {
  bridgeUrls,
  notificationMessage,
  notificationTargets,
  notificationTimeoutMs,
  notifyBridgeUrls,
};
