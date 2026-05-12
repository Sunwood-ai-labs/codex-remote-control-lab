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

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/info") {
      await route.fulfill({ json: { tokenRequired: true, authMode: "token" } });
      return;
    }
    if (url.pathname === "/api/artifacts") {
      await route.fulfill({ json: { artifacts: [] } });
      return;
    }
    if (url.pathname === "/api/threads") {
      await route.fulfill({ json: { threads: [] } });
      return;
    }
    if (url.pathname === "/api/review") {
      await route.fulfill({ json: { clean: true, files: [], totals: { additions: 0, deletions: 0 } } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function mockWebSocket(page) {
  await page.addInitScript((readyPayload) => {
    window.__sentFrames = [];
    window.__mockSockets = [];
    window.__dispatchServerMessage = (payload) => {
      for (const socket of window.__mockSockets) {
        socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    };
    class MockWebSocket extends EventTarget {
      constructor() {
        super();
        this.readyState = MockWebSocket.CONNECTING;
        window.__mockSockets.push(this);
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(readyPayload) }));
        }, 10);
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
    type: "ready",
    threadId: "thread-web-send",
    history: [],
    model: "gpt-5.5",
    clients: 1,
    workdir: root,
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
