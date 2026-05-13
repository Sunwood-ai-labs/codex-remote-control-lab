#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const defaultUsageUrl = "https://chatgpt.com/backend-api/wham/usage";

function expandHome(input) {
  const value = String(input || "").trim();
  if (!value) return value;
  if (value === "~") return process.env.HOME || value;
  if (value.startsWith("~/")) return path.join(process.env.HOME || "", value.slice(2));
  return value;
}

function codexAuthPath() {
  return expandHome(process.env.PHONE_CODEX_RATE_LIMIT_AUTH_PATH || process.env.PHONE_RATE_LIMIT_CODEX_AUTH_PATH || "~/.codex/auth.json");
}

function jwtPayload(token) {
  const payload = String(token || "").split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function accountIdFromToken(token) {
  const auth = jwtPayload(token)?.["https://api.openai.com/auth"];
  return auth && typeof auth === "object" && typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : null;
}

function assertTokenFresh(token) {
  const exp = jwtPayload(token)?.exp;
  if (!Number.isFinite(exp)) return;
  if (exp * 1000 <= Date.now() + 30_000) {
    throw new Error("Codex auth token is expired; open Codex Desktop or run Codex to refresh it");
  }
}

function readCodexAuth() {
  const filePath = codexAuthPath();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`failed to read Codex auth file: ${error.message}`);
  }
  const tokens = parsed?.tokens || {};
  const accessToken = tokens.access_token || parsed?.access_token || null;
  const accountId = tokens.account_id || parsed?.account_id || accountIdFromToken(accessToken);
  if (!accessToken) throw new Error("Codex auth file does not contain an access token");
  assertTokenFresh(accessToken);
  return { accessToken, accountId };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function windowLabel(seconds) {
  const totalSeconds = numberOrNull(seconds);
  if (!totalSeconds || totalSeconds <= 0) return "制限";
  const minutes = totalSeconds / 60;
  if (minutes >= 10079) return "週あたり";
  if (minutes >= 1439) return `${Math.ceil(minutes / 1440)}日`;
  if (minutes >= 60) return `${Math.ceil(minutes / 60)}時間`;
  return `${Math.ceil(minutes)}分`;
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatResetAt(resetAtSeconds) {
  const seconds = numberOrNull(resetAtSeconds);
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  const locale = process.env.PHONE_CODEX_RATE_LIMIT_LOCALE || process.env.PHONE_RATE_LIMIT_LOCALE || "ja-JP";
  const now = new Date();
  if (sameLocalDay(date, now)) {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
  }
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function whamWindowToRateLimit(window, labelPrefix = "") {
  if (!window || typeof window !== "object") return null;
  const usedPercent = numberOrNull(window.used_percent);
  const remainingPercent = usedPercent == null ? null : clampPercent(100 - usedPercent);
  const label = `${labelPrefix}${windowLabel(window.limit_window_seconds)}`.trim();
  const resetAt = numberOrNull(window.reset_at);
  const resetAfter = numberOrNull(window.reset_after_seconds);
  const fallbackResetAt = resetAfter == null ? null : Math.floor(Date.now() / 1000 + resetAfter);
  if (!label && remainingPercent == null && resetAt == null && fallbackResetAt == null) return null;
  return {
    label: label || "制限",
    remainingPercent,
    resetsAt: formatResetAt(resetAt ?? fallbackResetAt),
  };
}

function whamRateLimitWindows(rateLimit, labelPrefix = "") {
  return [
    whamWindowToRateLimit(rateLimit?.primary_window, labelPrefix),
    whamWindowToRateLimit(rateLimit?.secondary_window, labelPrefix),
  ].filter(Boolean);
}

function includeAdditionalLimits() {
  return process.env.PHONE_CODEX_RATE_LIMIT_INCLUDE_ADDITIONAL === "1" || process.env.PHONE_RATE_LIMIT_INCLUDE_ADDITIONAL === "1";
}

function normalizeWhamUsage(data) {
  const windows = whamRateLimitWindows(data?.rate_limit);
  if (includeAdditionalLimits() && Array.isArray(data?.additional_rate_limits)) {
    for (const limit of data.additional_rate_limits) {
      const name = String(limit?.limit_name || "").trim();
      if (!name || !limit?.rate_limit) continue;
      windows.push(...whamRateLimitWindows(limit.rate_limit, `${name} `));
    }
  }
  return windows;
}

async function codexUsageSnapshot() {
  if (typeof fetch !== "function") throw new Error("global fetch is unavailable; use Node.js 18 or newer");
  const { accessToken, accountId } = readCodexAuth();
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": "Codex Remote Rate Limit Reader",
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;
  const usageUrl = process.env.PHONE_CODEX_RATE_LIMIT_USAGE_URL || process.env.PHONE_RATE_LIMIT_USAGE_URL || defaultUsageUrl;
  const response = await fetch(usageUrl, { headers });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || response.statusText || "request failed";
    throw new Error(`Codex usage request failed with ${response.status}: ${detail}`);
  }
  if (!payload || typeof payload !== "object") throw new Error("Codex usage request returned no JSON payload");
  const windows = normalizeWhamUsage(payload);
  if (!windows.length) throw new Error("Codex usage payload contained no rate-limit windows");
  return {
    provider: "codex",
    source: "codex-auth",
    updatedAt: new Date().toISOString(),
    windows,
  };
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/read-desktop-rate-limits.js

Reads ~/.codex/auth.json, calls the Codex usage endpoint, and prints a
normalized JSON snapshot for PHONE_CODEX_RATE_LIMIT_REFRESH_COMMAND.

Environment:
  PHONE_CODEX_RATE_LIMIT_AUTH_PATH       Defaults to ~/.codex/auth.json
  PHONE_CODEX_RATE_LIMIT_USAGE_URL       Defaults to ${defaultUsageUrl}
  PHONE_CODEX_RATE_LIMIT_LOCALE          Defaults to ja-JP
  PHONE_CODEX_RATE_LIMIT_INCLUDE_ADDITIONAL=1
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  process.stdout.write(`${JSON.stringify(await codexUsageSnapshot())}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
