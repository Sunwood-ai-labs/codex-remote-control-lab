const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");
const WebSocket = require("ws");

const root = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForText(stream, pattern, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let body = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${pattern}`));
    }, timeoutMs);
    const onData = (chunk) => {
      body += chunk.toString();
      if (pattern.test(body)) {
        cleanup();
        resolve(body);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
    };
    stream.on("data", onData);
  });
}

function startFakeAppServer() {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (!msg.id) return;
      if (msg.method === "thread/start") {
        ws.send(JSON.stringify({ id: msg.id, result: { thread: { id: "thread-ui", turns: [] } } }));
        return;
      }
      if (msg.method === "thread/resume") {
        ws.send(JSON.stringify({ id: msg.id, result: { thread: { id: msg.params.threadId, turns: [] } } }));
        return;
      }
      if (msg.method === "thread/list" || msg.method === "thread/loaded/list" || msg.method === "model/list") {
        ws.send(JSON.stringify({ id: msg.id, result: { data: [] } }));
        return;
      }
      ws.send(JSON.stringify({ id: msg.id, result: {} }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `ws://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test("terminal websocket starts a PTY-backed Codex TUI resume process", { timeout: 15000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.homedir(), ".codex-terminal-pty-"));
  const fakeBin = path.join(temp, "fake-codex.js");
  fs.writeFileSync(
    fakeBin,
    `#!/usr/bin/env node
process.stdout.write("\\x1b[2J\\x1b[Hfake codex tui\\nargs:" + process.argv.slice(2).join(" ") + "\\n");
process.stdin.on("data", (chunk) => process.stdout.write("echo:" + chunk.toString()));
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
    `,
    { mode: 0o755 },
  );
  fs.chmodSync(fakeBin, 0o755);

  const fakeApp = await startFakeAppServer();
  const uiPort = await freePort();
  const child = spawn(process.execPath, ["scripts/start-phone.js"], {
    cwd: root,
    env: {
      ...process.env,
      PHONE_UI_PORT: String(uiPort),
      PHONE_DEBUG_NO_TOKEN: "1",
      CODEX_APP_SERVER_URL: fakeApp.url,
      CODEX_TERMINAL_BIN: fakeBin,
      CODEX_WORKDIR: temp,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ws;
  try {
    await waitForText(child.stdout, /Codex shared browser bridge is ready\./);
    ws = new WebSocket(`ws://127.0.0.1:${uiPort}/terminal?thread=thread-smoke&cwd=${encodeURIComponent(temp)}&cols=80&rows=24`);
    const seen = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`terminal output timeout: ${seen.join("\n")}`)), 8000);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "output") {
          seen.push(msg.data);
          if (seen.join("").includes("fake codex tui")) ws.send(JSON.stringify({ type: "input", data: "hello\r" }));
          if (seen.join("").includes("echo:hello")) {
            clearTimeout(timer);
            resolve();
          }
        }
        if (msg.type === "error") {
          clearTimeout(timer);
          reject(new Error(msg.text));
        }
      });
      ws.on("error", reject);
    });
    const allOutput = seen.join("");
    assert.match(allOutput, /args:resume --remote ws:\/\/127\.0\.0\.1:\d+ -C .* thread-smoke/);
    assert.match(allOutput, /echo:hello/);
    ws.send(JSON.stringify({ type: "terminate" }));
  } finally {
    if (ws) ws.close();
    child.kill("SIGTERM");
    await fakeApp.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("browser terminal mode renders the PTY-backed xterm screen", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.homedir(), ".codex-terminal-ui-"));
  const fakeBin = path.join(temp, "fake-codex.js");
  fs.writeFileSync(
    fakeBin,
    `#!/usr/bin/env node
process.stdout.write("\\x1b[2J\\x1b[Hfake codex tui\\nargs:" + process.argv.slice(2).join(" ") + "\\n");
process.stdin.on("data", (chunk) => process.stdout.write("echo:" + chunk.toString()));
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  fs.chmodSync(fakeBin, 0o755);

  const fakeApp = await startFakeAppServer();
  const uiPort = await freePort();
  const child = spawn(process.execPath, ["scripts/start-phone.js"], {
    cwd: root,
    env: {
      ...process.env,
      PHONE_UI_PORT: String(uiPort),
      PHONE_DEBUG_NO_TOKEN: "1",
      CODEX_APP_SERVER_URL: fakeApp.url,
      CODEX_TERMINAL_BIN: fakeBin,
      CODEX_WORKDIR: temp,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForText(child.stdout, /Codex shared browser bridge is ready\./);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${uiPort}` });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${uiPort}`);
    await page.locator("#modeTerminalButton").click();
    await page.waitForFunction(() => document.querySelector(".xterm-rows")?.textContent?.includes("fake codex tui"));
    const state = await page.evaluate(() => ({
      hasIframe: Boolean(document.querySelector("iframe")),
      hasXterm: Boolean(document.querySelector(".xterm")),
      hasSmartInput: Boolean(document.querySelector("#terminalInputArea #terminalPrompt")),
      hasTextMode: Boolean(document.querySelector('[data-terminal-input-mode="text"].active')),
      rawKeys: Array.from(document.querySelectorAll("#terminalNativeKeys button")).map((button) => button.textContent.trim()),
      sendLabel: document.querySelector("#terminalSend")?.textContent?.trim() || "",
      terminalText: document.querySelector(".xterm-rows")?.textContent || "",
      mode: document.body.dataset.mainMode,
    }));
    assert.equal(state.hasIframe, false);
    assert.equal(state.hasXterm, true);
    assert.equal(state.hasSmartInput, true);
    assert.equal(state.hasTextMode, true);
    assert.deepEqual(state.rawKeys, ["Tab", "/", "$", "⌫", "📁", "📎", "📋"]);
    assert.equal(state.sendLabel, "Enter ↵");
    assert.equal(state.mode, "terminal");
    assert.match(state.terminalText, /fake codex tui/);
    assert.match(state.terminalText, /thread-ui/);
    await page.locator('[data-terminal-action="copy"]').click();
    await page.waitForFunction(() => document.querySelector(".status-list")?.textContent?.includes("ターミナル表示をコピーしました。"));
    const copiedTerminalText = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copiedTerminalText, /fake codex tui/);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => Promise.reject(new Error("clipboard blocked")),
          readText: () => Promise.resolve(""),
        },
      });
      document.execCommand = () => false;
    });
    await page.locator('[data-terminal-action="copy"]').click();
    await page.waitForFunction(() => document.querySelector(".terminal-copy-fallback"));
    await page.waitForFunction(() => {
      const textarea = document.querySelector(".terminal-copy-textarea");
      return textarea && textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length;
    });
    const fallbackCopy = await page.locator(".terminal-copy-textarea").evaluate((textarea) => ({
      value: textarea.value,
      selected: textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length,
    }));
    assert.match(fallbackCopy.value, /fake codex tui/);
    assert.equal(fallbackCopy.selected, true);
    await page.locator(".terminal-copy-fallback button", { hasText: "閉じる" }).click();
    await page.locator("#terminalPrompt").fill("hello");
    await page.locator("#terminalSend").click();
    await page.waitForTimeout(300);
    const afterSend = await page.evaluate(() => ({
      text: document.querySelector(".xterm-rows")?.textContent || "",
      prompt: document.querySelector("#terminalPrompt")?.value || "",
      sendLabel: document.querySelector("#terminalSend")?.textContent?.trim() || "",
    }));
    assert.match(afterSend.text, /hello/);
    assert.equal(afterSend.prompt, "");
    assert.equal(afterSend.sendLabel, "Enter ↵");
    await page.locator("#terminalSend").click();
    await page.waitForFunction(() => document.querySelector(".xterm-rows")?.textContent?.includes("echo:hello"));
    await page.locator('[data-terminal-input-mode="keys"]').click();
    await page.locator("[data-terminal-ctrl-c]").click();
    assert.equal(await page.locator("#terminalCtrlCConfirm").isVisible(), true);
    await page.locator("#terminalCtrlCCancel").click();
    assert.equal(await page.locator("#terminalCtrlCConfirm").isVisible(), false);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    await fakeApp.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("mobile terminal mode uses dynamic viewport height and touch-scrolls xterm history", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.homedir(), ".codex-terminal-scroll-"));
  const fakeBin = path.join(temp, "fake-codex.js");
  fs.writeFileSync(
    fakeBin,
    `#!/usr/bin/env node
for (let i = 1; i <= 140; i += 1) process.stdout.write("line-" + String(i).padStart(3, "0") + "\\n");
process.stdin.on("data", (chunk) => process.stdout.write("echo:" + chunk.toString()));
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  fs.chmodSync(fakeBin, 0o755);

  const fakeApp = await startFakeAppServer();
  const uiPort = await freePort();
  const child = spawn(process.execPath, ["scripts/start-phone.js"], {
    cwd: root,
    env: {
      ...process.env,
      PHONE_UI_PORT: String(uiPort),
      PHONE_DEBUG_NO_TOKEN: "1",
      CODEX_APP_SERVER_URL: fakeApp.url,
      CODEX_TERMINAL_BIN: fakeBin,
      CODEX_WORKDIR: temp,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForText(child.stdout, /Codex shared browser bridge is ready\./);
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    await page.goto(`http://127.0.0.1:${uiPort}`);
    await page.locator("#modeTerminalButton").click();
    await page.waitForFunction(() => document.querySelector(".xterm-rows")?.textContent?.includes("line-140"));
    const before = await page.evaluate(() => {
      const viewport = document.querySelector(".xterm-viewport");
      const host = document.querySelector("#terminalHost").getBoundingClientRect();
      const appShellHeight = getComputedStyle(document.querySelector(".app-shell")).height;
      const workspaceHeight = getComputedStyle(document.querySelector(".workspace")).height;
      return {
        appShellHeight,
        workspaceHeight,
        hostHeight: host.height,
        hostBottom: host.bottom,
        innerHeight: window.innerHeight,
        text: document.querySelector(".xterm-rows")?.textContent || "",
      };
    });
    assert.equal(before.appShellHeight, `${before.innerHeight}px`);
    assert.equal(before.workspaceHeight, `${before.innerHeight}px`);
    assert.ok(before.hostHeight > 520, `terminal host too small: ${JSON.stringify(before)}`);
    assert.ok(before.hostBottom <= before.innerHeight + 1, `terminal host overflows viewport: ${JSON.stringify(before)}`);
    assert.match(before.text, /line-140/);

    await page.evaluate(() => {
      const host = document.querySelector("#terminalHost");
      host.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 180, clientY: 280, bubbles: true }));
      host.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 180, clientY: 700, bubbles: true, cancelable: true }));
      host.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 180, clientY: 700, bubbles: true }));
    });
    await page.waitForFunction((previousText) => {
      return (document.querySelector(".xterm-rows")?.textContent || "") !== previousText;
    }, before.text);
    const afterText = await page.evaluate(() => document.querySelector(".xterm-rows")?.textContent || "");
    assert.notEqual(afterText, before.text, "touch scroll did not change the rendered xterm viewport");
    assert.match(afterText, /line-0[7-9]\d|line-1[01]\d/);

    const joystickState = await page.evaluate(async () => {
      const host = document.querySelector("#terminalHost");
      const makeTouch = (clientX, clientY) => new Touch({ identifier: 2, target: host, clientX, clientY });
      let documentMoveCount = 0;
      const onDocumentMove = () => {
        documentMoveCount += 1;
      };
      document.addEventListener("touchmove", onDocumentMove);
      host.dispatchEvent(new TouchEvent("touchstart", { touches: [makeTouch(180, 300)], targetTouches: [makeTouch(180, 300)], changedTouches: [makeTouch(180, 300)], bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const viewport = document.querySelector(".xterm-viewport");
      const beforeScrollTop = viewport?.scrollTop ?? 0;
      host.dispatchEvent(new TouchEvent("touchmove", { touches: [makeTouch(180, 360)], targetTouches: [makeTouch(180, 360)], changedTouches: [makeTouch(180, 360)], bubbles: true, cancelable: true }));
      const visible = Boolean(document.querySelector(".terminal-joystick-overlay"));
      const active = document.querySelector(".terminal-joystick-zone.active")?.textContent || "";
      const afterScrollTop = viewport?.scrollTop ?? 0;
      host.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [makeTouch(180, 360)], bubbles: true, cancelable: true }));
      document.removeEventListener("touchmove", onDocumentMove);
      return {
        visible,
        active,
        documentMoveCount,
        beforeScrollTop,
        afterScrollTop,
        removed: !document.querySelector(".terminal-joystick-overlay"),
      };
    });
    assert.equal(joystickState.visible, true);
    assert.equal(joystickState.active, "↓");
    assert.equal(joystickState.documentMoveCount, 0);
    assert.equal(joystickState.afterScrollTop, joystickState.beforeScrollTop);
    assert.equal(joystickState.removed, true);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    await fakeApp.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
