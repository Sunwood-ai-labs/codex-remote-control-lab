function bridgeUrls(addresses, uiPort, phoneToken) {
  return addresses.map((address) => {
    const url = new URL(`http://${address}:${uiPort}/`);
    if (phoneToken) url.searchParams.set("token", phoneToken);
    return url.toString();
  });
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

function taskStatusLabel(status) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "approval") return "waiting for approval";
  return String(status || "updated");
}

function taskNotificationMessage(event = {}) {
  const provider = event.provider || "Codex";
  const lines = [
    `${provider} task ${taskStatusLabel(event.status)}.`,
    "",
  ];
  if (event.threadId) lines.push(`Thread: ${event.threadId}`);
  if (event.turnId) lines.push(`Turn: ${event.turnId}`);
  if (event.model) lines.push(`Model: ${event.model}`);
  if (event.workdir) lines.push(`Workdir: ${event.workdir}`);
  if (event.message) lines.push("", String(event.message));
  const urls = Array.isArray(event.urls) ? event.urls.filter(Boolean) : [];
  if (urls.length) lines.push("", ...urls);
  else if (event.url) lines.push("", event.url);
  return lines.join("\n");
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
  return postNtfyNotification(
    target,
    {
      title: "Codex phone bridge ready",
      tags: "computer,phone",
      clickUrl: urls[0],
      message: notificationMessage(urls),
    },
    fetchImpl,
    timeoutMs,
  );
}

async function postNtfyNotification(target, notification, fetchImpl, timeoutMs) {
  const headers = {
    title: notification.title,
    tags: notification.tags || "computer,phone",
  };
  if (notification.clickUrl) headers.click = notification.clickUrl;
  if (target.token) headers.authorization = `Bearer ${target.token}`;
  const response = await fetchWithTimeout(fetchImpl, ntfyEndpoint(target), {
    method: "POST",
    headers,
    body: notification.message,
  }, timeoutMs);
  if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`);
}

async function postPushover(target, urls, fetchImpl, timeoutMs) {
  return postPushoverNotification(
    target,
    {
      title: "Codex phone bridge ready",
      clickUrl: urls[0],
      clickTitle: "Open Codex phone bridge",
      message: notificationMessage(urls),
    },
    fetchImpl,
    timeoutMs,
  );
}

async function postPushoverNotification(target, notification, fetchImpl, timeoutMs) {
  const form = new URLSearchParams({
    token: target.token,
    user: target.user,
    title: notification.title,
    message: notification.message,
  });
  if (notification.clickUrl) {
    form.set("url", notification.clickUrl);
    form.set("url_title", notification.clickTitle || "Open phone bridge");
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
  return postDiscordNotification(
    target,
    { message: notificationMessage(urls) },
    fetchImpl,
    timeoutMs,
  );
}

async function postDiscordNotification(target, notification, fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, discordEndpoint(target), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: notification.message,
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
  return Promise.all(targets.map(async (target) => {
    try {
      if (target.type === "ntfy") await postNtfy(target, urls, fetchImpl, timeoutMs);
      if (target.type === "pushover") await postPushover(target, urls, fetchImpl, timeoutMs);
      if (target.type === "discord") await postDiscord(target, urls, fetchImpl, timeoutMs);
      return { type: target.type, ok: true };
    } catch (error) {
      return { type: target.type, ok: false, error: error.message };
    }
  }));
}

async function notifyTaskEvent(event = {}, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const targets = notificationTargets(env);
  const timeoutMs = notificationTimeoutMs(env);
  const provider = event.provider || "Codex";
  const status = event.status || "updated";
  const notification = {
    title: `${provider} task ${taskStatusLabel(status)}`,
    tags: status === "failed" ? "warning,computer" : status === "approval" ? "bell,computer" : "white_check_mark,computer",
    clickUrl: event.url || (Array.isArray(event.urls) && event.urls.length === 1 ? event.urls[0] : ""),
    clickTitle: "Open phone bridge thread",
    message: taskNotificationMessage(event),
  };
  return Promise.all(targets.map(async (target) => {
    try {
      if (target.type === "ntfy") await postNtfyNotification(target, notification, fetchImpl, timeoutMs);
      if (target.type === "pushover") await postPushoverNotification(target, notification, fetchImpl, timeoutMs);
      if (target.type === "discord") await postDiscordNotification(target, notification, fetchImpl, timeoutMs);
      return { type: target.type, ok: true };
    } catch (error) {
      return { type: target.type, ok: false, error: error.message };
    }
  }));
}

module.exports = {
  bridgeUrls,
  notificationMessage,
  notificationTargets,
  notificationTimeoutMs,
  notifyTaskEvent,
  notifyBridgeUrls,
  taskNotificationMessage,
};
