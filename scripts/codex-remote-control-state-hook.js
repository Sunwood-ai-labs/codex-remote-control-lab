#!/usr/bin/env node

const http = require("node:http");
const https = require("node:https");

function readStdin() {
  return new Promise((resolve) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      body += chunk;
    });
    process.stdin.on("end", () => resolve(body));
  });
}

function postJson(urlText, token, payload) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlText);
    } catch {
      resolve(false);
      return;
    }
    const client = url.protocol === "https:" ? https : http;
    const data = Buffer.from(JSON.stringify(payload));
    const req = client.request(
      url,
      {
        method: "POST",
        timeout: 500,
        headers: {
          "content-type": "application/json",
          "content-length": String(data.length),
          "x-codex-remote-hook-token": token || "",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end(data);
  });
}

(async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const url = process.env.CODEX_REMOTE_HOOK_URL || "";
  if (url) await postJson(url, process.env.CODEX_REMOTE_HOOK_TOKEN || "", payload);

  if (payload.hook_event_name === "Stop") {
    process.stdout.write(JSON.stringify({ continue: true }));
  }
})().catch(() => {
  process.exitCode = 0;
});
