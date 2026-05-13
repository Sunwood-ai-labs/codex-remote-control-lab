const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const token = "web-send-token";

const mime = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "application/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const target = path.resolve(publicDir, `.${pathname}`);
    if (!target.startsWith(`${publicDir}${path.sep}`) && target !== path.join(publicDir, "index.html")) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": mime.get(path.extname(target)) || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.on("error", reject);
  });
}

async function mockApi(page, state = {}) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/info") {
      await route.fulfill({ json: { tokenRequired: true, authMode: "token" } });
      return;
    }
    if (url.pathname === "/api/artifacts") {
      const artifacts = state.artifacts || [];
      await route.fulfill({ json: { data: artifacts, artifacts } });
      return;
    }
    if (url.pathname === "/api/threads") {
      if (state.failThreads) {
        await route.abort("failed");
        return;
      }
      const threads = state.threads || [];
      await route.fulfill({ json: { data: threads, threads } });
      return;
    }
    if (url.pathname === "/api/thread") {
      const threadId = url.searchParams.get("thread");
      const delay = state.threadDelays?.[threadId] || 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        json: state.threadSnapshots?.[threadId] || { threadId, history: [] },
      });
      return;
    }
    if (url.pathname === "/api/review") {
      await route.fulfill({ json: state.review || { clean: true, files: [], totals: { additions: 0, deletions: 0 } } });
      return;
    }
    if (url.pathname === "/api/file") {
      const filePath = url.searchParams.get("path") || "";
      const file = state.files?.[filePath] || { path: filePath, kind: "text", text: "" };
      await route.fulfill({ json: file });
      return;
    }
    if (url.pathname === "/api/skills") {
      if (state.failSkillsOnce) {
        state.failSkillsOnce = false;
        await route.fulfill({ status: 503, json: { error: "skills temporarily unavailable" } });
        return;
      }
      await route.fulfill({ json: { data: state.skills || [] } });
      return;
    }
    if (url.pathname === "/api/plugins") {
      await route.fulfill({ json: state.plugins || { marketplaces: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function mockWebSocket(page, options = {}) {
  await page.addInitScript((config) => {
    window.__sentFrames = [];
    window.__mockSockets = [];
    window.__mockSocketUrls = [];
    window.__dispatchServerMessage = (payload) => {
      for (const socket of window.__mockSockets) {
        socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    };
    window.__closeMockSockets = () => {
      for (const socket of window.__mockSockets) socket.close();
    };
    class MockWebSocket extends EventTarget {
      constructor(url) {
        super();
        this.readyState = MockWebSocket.CONNECTING;
        this.url = url;
        window.__mockSocketUrls.push(url);
        window.__mockSockets.push(this);
        const socketUrl = new URL(url, location.href);
        const threadId = socketUrl.searchParams.get("thread") || "";
        const readyPayload = config.readyPayloadByThread[threadId] || config.defaultReadyPayload;
        const readyDelay = config.readyDelayByThread[threadId] ?? config.defaultReadyDelay;
        setTimeout(() => {
          if (!readyPayload) return;
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(readyPayload) }));
        }, readyDelay);
      }
      send(frame) {
        window.__sentFrames.push(JSON.parse(frame));
      }
      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close"));
      }
    }
    MockWebSocket.CONNECTING = 0;
    MockWebSocket.OPEN = 1;
    MockWebSocket.CLOSING = 2;
    MockWebSocket.CLOSED = 3;
    window.WebSocket = MockWebSocket;
  }, {
    defaultReadyPayload: options.defaultReadyPayload || {
      type: "ready",
      threadId: "thread-web-send",
      history: [],
      model: "gpt-5.5",
      clients: 1,
      workdir: root,
    },
    defaultReadyDelay: options.defaultReadyDelay ?? 10,
    readyDelayByThread: options.readyDelayByThread || {},
    readyPayloadByThread: options.readyPayloadByThread || {},
  });
}

test("web app submit sends prompt through WebSocket and hides raw reconnect payloads", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockApi(page);
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");

  await page.fill("#prompt", "WEBアプリからの送信テスト");
  await page.click("#send");

  const sentFrame = await page.waitForFunction(() => window.__sentFrames?.find((frame) => frame.type === "prompt"));
  const payload = await sentFrame.jsonValue();
  assert.equal(payload.token, token);
  assert.equal(payload.text, "WEBアプリからの送信テスト");
  assert.equal(payload.options.model, undefined);
  assert.equal(await page.inputValue("#prompt"), "");

  await page.evaluate(() => {
    window.__dispatchServerMessage({
      type: "error",
      text: JSON.stringify({
        error: {
          message: "Reconnecting... 2/5",
          codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: null } },
          additionalDetails: "stream disconnected before completion: websocket closed by server before response.completed",
          willRetry: true,
        },
        threadId: "thread-web-send",
        turnId: "turn-web-send",
      }),
    });
  });

  const statusText = await page.locator("#runStateLabel").innerText();
  const logText = await page.locator("#log").innerText();
  assert.match(statusText, /再接続中/);
  assert.doesNotMatch(logText, /responseStreamDisconnected/);
  assert.doesNotMatch(logText, /websocket closed by server before response\.completed/);
  assert.equal(await page.locator("#runState").getAttribute("data-state"), "reconnecting");
});

test("background thread polling stays quiet after browser bridge disconnects", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const apiState = { failThreads: false };
  await mockApi(page, apiState);
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");

  await page.evaluate(() => window.__closeMockSockets());
  await page.waitForFunction(() => document.querySelector("#runState")?.dataset.state === "disconnected");
  apiState.failThreads = true;
  await page.evaluate(() => loadThreads({ background: true }));

  const logText = await page.locator("#log").innerText();
  assert.doesNotMatch(logText, /thread一覧を読めませんでした: Failed to fetch/);
  assert.equal(await page.locator("#runState").getAttribute("data-state"), "disconnected");
});

test("mobile artifact preview stays open when launched from chat and panel rows", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await mockApi(page, {
    artifacts: [{ path: "README.md", name: "README.md", kind: "markdown" }],
    files: {
      "README.md": { path: "README.md", kind: "markdown", text: "# Artifact Preview\n\nRendered from a test artifact." },
    },
    review: {
      clean: false,
      files: [{ path: "README.md", status: "M", openable: true, additions: 1, deletions: 0 }],
      totals: { additions: 1, deletions: 0 },
    },
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });

  const chatCard = page.locator(".chat-artifact-card[data-open-artifact-path='README.md']");
  await chatCard.waitFor();
  const chatCardBox = await chatCard.boundingBox();
  assert.ok(chatCardBox);
  await page.touchscreen.tap(chatCardBox.x + chatCardBox.width / 2, chatCardBox.y + chatCardBox.height / 2);
  await page.waitForSelector("#artifactPanel[aria-hidden='false']");
  assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("show-panel")), true);
  await page.getByText("Rendered from a test artifact.").waitFor();

  await page.locator("#artifactList .artifact-row").first().click();
  await page.getByText("Rendered from a test artifact.").waitFor();
  assert.equal(await page.locator("#artifactPanel").getAttribute("aria-hidden"), "false");
  assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("show-panel")), true);
});

test("mobile artifact tap keeps the chat-selected artifact active", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await mockApi(page, {
    artifacts: [{ path: "README.md", name: "README.md", kind: "markdown" }],
    files: {
      "README.md": { path: "README.md", kind: "markdown", text: "# README Artifact\n\nWrong artifact if this appears." },
      "docs/proof.md": { path: "docs/proof.md", kind: "markdown", text: "# Chat Selected Artifact\n\nOpened from the chat card." },
    },
    review: {
      clean: false,
      files: [{ path: "docs/proof.md", status: "A", openable: true, additions: 1, deletions: 0 }],
      totals: { additions: 1, deletions: 0 },
    },
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });

  const chatCard = page.locator(".chat-artifact-card[data-open-artifact-path='docs/proof.md']");
  await chatCard.waitFor();
  const chatCardBox = await chatCard.boundingBox();
  assert.ok(chatCardBox);
  await page.touchscreen.tap(chatCardBox.x + chatCardBox.width / 2, chatCardBox.y + chatCardBox.height / 2);
  await page.waitForSelector("#artifactPanel[aria-hidden='false']");
  await page.waitForTimeout(100);

  const previewText = await page.locator("#artifactPreview").innerText();
  assert.match(previewText, /Chat Selected Artifact/);
  assert.doesNotMatch(previewText, /README Artifact/);
});

test("mobile artifact card opens when the tap target is nested text", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockApi(page, {
    artifacts: [{ path: "README.md", name: "README.md", kind: "markdown" }],
    files: {
      "README.md": { path: "README.md", kind: "markdown", text: "# Artifact Preview\n\nRendered from nested text." },
    },
    review: {
      clean: false,
      files: [{ path: "README.md", status: "M", openable: true, additions: 1, deletions: 0 }],
      totals: { additions: 1, deletions: 0 },
    },
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".chat-artifact-card[data-open-artifact-path='README.md'] strong");

  await page.evaluate(() => {
    const textNode = document.querySelector(".chat-artifact-card[data-open-artifact-path='README.md'] strong").firstChild;
    textNode.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });

  await page.waitForSelector("#artifactPanel[aria-hidden='false']");
  await page.getByText("Rendered from nested text.").waitFor();
  assert.deepEqual(pageErrors, []);
});

test("artifact card click still lets other document click handlers close menus", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockApi(page, {
    artifacts: [{ path: "README.md", name: "README.md", kind: "markdown" }],
    files: {
      "README.md": { path: "README.md", kind: "markdown", text: "# Artifact Preview\n\nRendered from a test artifact." },
    },
    review: {
      clean: false,
      files: [{ path: "README.md", status: "M", openable: true, additions: 1, deletions: 0 }],
      totals: { additions: 1, deletions: 0 },
    },
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");

  await page.evaluate(() => toggleModelMenu());
  await page.waitForFunction(() => !document.querySelector("#modelMenu")?.classList.contains("hidden"));
  await page.locator(".chat-artifact-card[data-open-artifact-path='README.md']").click();

  await page.getByText("Rendered from a test artifact.").waitFor();
  assert.equal(await page.locator("#artifactPanel").getAttribute("aria-hidden"), "false");
  assert.equal(await page.locator("#modelMenu").evaluate((node) => node.classList.contains("hidden")), true);
});

test("slash opens installed skill menu and inserts the selected command", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockApi(page, {
    skills: [
      { id: "browser-use:browser", name: "browser-use:browser", trigger: "/browser-use:browser", description: "Browser automation" },
      { id: "github:github", name: "github:github", trigger: "/github:github", description: "GitHub triage" },
    ],
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");

  await page.fill("#prompt", "please /bro");
  await page.waitForSelector("#slashSkillMenu:not(.hidden)");
  assert.match(await page.locator("#slashSkillMenu").innerText(), /browser-use:browser/);
  assert.doesNotMatch(await page.locator("#slashSkillMenu").innerText(), /github:github/);

  await page.press("#prompt", "Enter");
  assert.equal(await page.inputValue("#prompt"), "please /browser-use:browser ");
  assert.equal(await page.locator("#slashSkillMenu").evaluate((node) => node.classList.contains("hidden")), true);
});

test("slash skill menu retries after the first skills request fails", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const apiState = {
    failSkillsOnce: true,
    skills: [{ id: "browser-use:browser", name: "browser-use:browser", trigger: "/browser-use:browser" }],
  };
  await mockApi(page, apiState);
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");

  await page.fill("#prompt", "/bro");
  await page.getByText("スキルを読めませんでした: skills temporarily unavailable").waitFor();

  await page.fill("#prompt", "retry /bro");
  await page.waitForSelector("#slashSkillMenu:not(.hidden)");
  assert.match(await page.locator("#slashSkillMenu").innerText(), /browser-use:browser/);
});

test("slash skill menu opens from full-width mobile slash and normalizes the command", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await mockApi(page, {
    skills: [
      { id: "browser-use:browser", name: "browser-use:browser", trigger: "/browser-use:browser", description: "Browser automation" },
      { id: "github:github", name: "github:github", trigger: "/github:github", description: "GitHub triage" },
    ],
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");

  await page.fill("#prompt", "please ／bro");
  await page.waitForSelector("#slashSkillMenu:not(.hidden)");
  assert.match(await page.locator("#slashSkillMenu").innerText(), /browser-use:browser/);
  assert.doesNotMatch(await page.locator("#slashSkillMenu").innerText(), /github:github/);

  await page.press("#prompt", "Enter");
  assert.equal(await page.inputValue("#prompt"), "please /browser-use:browser ");
  assert.equal(await page.locator("#slashSkillMenu").evaluate((node) => node.classList.contains("hidden")), true);
});

test("plugin panel defaults to installed and enabled entries only", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await mockApi(page, {
    plugins: {
      marketplaces: [
        {
          id: "built-in",
          entries: [
            { summary: { id: "github", name: "GitHub", enabled: true } },
            { summary: { id: "browser", name: "Browser", installed: true } },
            { summary: { id: "marketplace-only", name: "Marketplace Only", installed: false, enabled: false } },
            { summary: { id: "available-one", name: "Available One", status: "available" } },
          ],
        },
      ],
    },
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });

  await page.click("#pluginsButton");
  await page.getByText("GitHub").waitFor();

  const panelText = await page.locator("#artifactList").innerText();
  assert.match(panelText, /GitHub/);
  assert.match(panelText, /Browser/);
  assert.doesNotMatch(panelText, /Marketplace Only/);
  assert.doesNotMatch(panelText, /Available One/);
});

test("plugin panel empty state explains when no plugins are installed", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await mockApi(page, {
    plugins: {
      marketplaces: [
        {
          id: "available",
          plugins: [
            { summary: { id: "uninstalled", name: "Uninstalled Plugin", status: "available" } },
          ],
        },
      ],
    },
  });
  await mockWebSocket(page);
  await page.goto(`${server.origin}/?token=${token}`, { waitUntil: "networkidle" });

  await page.click("#pluginsButton");
  await page.getByText("導入済み/有効なプラグインはありません").waitFor();

  const panelText = await page.locator("#artifactList").innerText();
  assert.match(panelText, /導入済み\/有効なプラグインはありません/);
  assert.doesNotMatch(panelText, /Uninstalled Plugin/);
});

test("thread switching keeps a transition entry until target history is ready", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 844 }, deviceScaleFactor: 1 });
  const apiState = {
    threads: [
      { id: "thread-a", name: "Thread A", cwd: root, updatedAt: Date.now() },
      { id: "thread-b", name: "Thread B", cwd: root, updatedAt: Date.now() },
    ],
    threadDelays: { "thread-b": 160 },
    threadSnapshots: {
      "thread-b": {
        threadId: "thread-b",
        history: [{ type: "assistant", text: "target snapshot answer" }],
      },
    },
  };
  await mockApi(page, apiState);
  await mockWebSocket(page, {
    readyPayloadByThread: {
      "thread-a": {
        type: "ready",
        threadId: "thread-a",
        history: [{ type: "assistant", text: "current thread answer" }],
        model: "gpt-5.5",
        clients: 1,
        workdir: root,
      },
      "thread-b": {
        type: "ready",
        threadId: "thread-b",
        history: [{ type: "assistant", text: "target ready answer" }],
        model: "gpt-5.5",
        clients: 1,
        workdir: root,
      },
    },
    readyDelayByThread: { "thread-b": 360 },
  });

  await page.goto(`${server.origin}/?token=${token}&thread=thread-a`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");
  await page.getByText("current thread answer").waitFor();

  await page.getByRole("button", { name: /Thread B/ }).click();
  await page.waitForTimeout(60);

  let logText = await page.locator("#log").innerText();
  assert.match(logText, /thread履歴を読み込み中/);
  assert.doesNotMatch(logText, /current thread answer/);
  assert.doesNotMatch(logText, /target snapshot answer|target ready answer/);

  await page.getByText("target snapshot answer").waitFor();
  logText = await page.locator("#log").innerText();
  assert.doesNotMatch(logText, /current thread answer/);
  assert.match(logText, /target snapshot answer/);

  await page.getByText("target ready answer").waitFor();
  logText = await page.locator("#log").innerText();
  assert.doesNotMatch(logText, /target snapshot answer/);
  assert.match(logText, /target ready answer/);

  await page.locator("#newThread").click();
  await page.waitForTimeout(30);
  logText = await page.locator("#log").innerText();
  assert.doesNotMatch(logText, /target ready answer|current thread answer/);
});

test("slower thread snapshot does not overwrite ready thread history", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 844 }, deviceScaleFactor: 1 });
  const apiState = {
    threads: [
      { id: "thread-a", name: "Thread A", cwd: root, updatedAt: Date.now() },
      { id: "thread-b", name: "Thread B", cwd: root, updatedAt: Date.now() },
    ],
    threadDelays: { "thread-b": 460 },
    threadSnapshots: {
      "thread-b": {
        threadId: "thread-b",
        history: [{ type: "assistant", text: "late stale snapshot answer" }],
      },
    },
  };
  await mockApi(page, apiState);
  await mockWebSocket(page, {
    readyPayloadByThread: {
      "thread-a": {
        type: "ready",
        threadId: "thread-a",
        history: [{ type: "assistant", text: "current thread answer" }],
        model: "gpt-5.5",
        clients: 1,
        workdir: root,
      },
      "thread-b": {
        type: "ready",
        threadId: "thread-b",
        history: [{ type: "assistant", text: "fresh ready answer" }],
        model: "gpt-5.5",
        clients: 1,
        workdir: root,
      },
    },
    readyDelayByThread: { "thread-b": 140 },
  });

  await page.goto(`${server.origin}/?token=${token}&thread=thread-a`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");
  await page.getByText("current thread answer").waitFor();

  await page.getByRole("button", { name: /Thread B/ }).click();
  await page.getByText("fresh ready answer").waitFor();
  await page.waitForTimeout(520);

  const logText = await page.locator("#log").innerText();
  assert.match(logText, /fresh ready answer/);
  assert.doesNotMatch(logText, /late stale snapshot answer|current thread answer/);
});

test("stale WebSocket ready messages from previous switches are ignored", async (t) => {
  const server = await startStaticServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 844 }, deviceScaleFactor: 1 });
  const apiState = {
    threads: [
      { id: "thread-a", name: "Thread A", cwd: root, updatedAt: Date.now() },
      { id: "thread-b", name: "Thread B", cwd: root, updatedAt: Date.now() },
    ],
    threadSnapshots: {
      "thread-a": { threadId: "thread-a", history: [{ type: "assistant", text: "thread a snapshot" }] },
      "thread-b": { threadId: "thread-b", history: [{ type: "assistant", text: "thread b snapshot" }] },
    },
  };
  await mockApi(page, apiState);
  await mockWebSocket(page, {
    readyPayloadByThread: {
      "thread-a": {
        type: "ready",
        threadId: "thread-a",
        history: [{ type: "assistant", text: "thread a ready" }],
        model: "gpt-5.5",
        clients: 1,
        workdir: root,
      },
      "thread-b": {
        type: "ready",
        threadId: "thread-b",
        history: [{ type: "assistant", text: "stale thread b ready" }],
        model: "gpt-5.5",
        clients: 1,
        workdir: root,
      },
    },
    readyDelayByThread: { "thread-b": 180 },
  });

  await page.goto(`${server.origin}/?token=${token}&thread=thread-a`, { waitUntil: "networkidle" });
  await page.waitForSelector("#send:not([disabled])");
  await page.getByText("thread a ready").waitFor();

  await page.getByRole("button", { name: /Thread B/ }).click();
  await page.getByRole("button", { name: /Thread A/ }).click();
  await page.waitForTimeout(260);

  const logText = await page.locator("#log").innerText();
  assert.match(logText, /thread a ready|thread a snapshot/);
  assert.doesNotMatch(logText, /stale thread b ready|thread b snapshot/);
});
