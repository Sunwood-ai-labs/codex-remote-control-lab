const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const assetsDir = path.join(root, "docs", "assets");
const token = "docs-token";

const mime = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "application/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

const threads = [
  { id: "thread-ocdex-v020", name: "OCdex v0.2.0 phone bridge QA", cwd: root, updatedAt: Date.now() },
  { id: "thread-artifacts", name: "Artifact preview polish", cwd: root, updatedAt: Date.now() - 3600_000 },
  { id: "thread-mobile", name: "Mobile drawer and compact composer", cwd: root, updatedAt: Date.now() - 86_400_000 },
];

const history = [
  { type: "user", text: "README のスクリーンショットを最新版に差し替えて。" },
  {
    type: "assistant",
    text: "最新版の bridge UI で撮り直しました。\n\n- headless app-server 接続\n- 履歴同期\n- artifact preview\n- mobile drawer / compact composer",
  },
  { type: "status", text: "履歴同期を更新しました。Desktop Remote Connection から再表示できます。" },
];

const artifacts = [
  { name: "README.md", path: "README.md", kind: "markdown" },
  { name: "AGENTS.md", path: "AGENTS.md", kind: "markdown" },
  { name: "desktop-like-ui-desktop.png", path: "docs/assets/desktop-like-ui-desktop.png", kind: "image" },
];

function isInsideDir(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function realpathIfExists(file) {
  try {
    return fs.realpathSync.native(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function resolveInsideDir(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (!isInsideDir(resolvedBase, resolvedTarget)) return null;

  const realBase = fs.realpathSync.native(resolvedBase);
  const realTarget = realpathIfExists(resolvedTarget);
  if (realTarget && !isInsideDir(realBase, realTarget)) return null;

  return resolvedTarget;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = resolveInsideDir(publicDir, path.resolve(publicDir, `.${pathname}`));
    if (!file) return res.writeHead(403).end("Forbidden");
    fs.readFile(file, (error, data) => {
      if (error) return res.writeHead(404).end("Not found");
      res.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function mockApi(page, origin) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/threads") return route.fulfill({ json: { data: threads } });
    if (url.pathname === "/api/thread") return route.fulfill({ json: { threadId: "thread-ocdex-v020", history } });
    if (url.pathname === "/api/artifacts") return route.fulfill({ json: { data: artifacts } });
    if (url.pathname === "/api/config") {
      return route.fulfill({
        json: { auth: { authMethod: "token" }, config: { config: { model: "gpt-5.5", cwd: root } }, errors: [] },
      });
    }
    if (url.pathname === "/api/models") {
      return route.fulfill({
        json: {
          data: [
            { model: "gpt-5.5", displayName: "GPT-5.5", defaultReasoningEffort: "medium" },
            { model: "gpt-5.4", displayName: "GPT-5.4", defaultReasoningEffort: "medium" },
          ],
        },
      });
    }
    if (url.pathname === "/api/status") {
      return route.fulfill({
        json: {
          uiPort: 45214,
          codexUrl: "ws://127.0.0.1:45213",
          historySyncEnabled: true,
          workdir: root,
          bridges: [{ threadId: "thread-ocdex-v020", clients: 2, ready: true }],
        },
      });
    }
    if (url.pathname === "/api/file") {
      const requested = url.searchParams.get("path") || "README.md";
      if (/\.(png|jpe?g|webp|gif|svg)$/i.test(requested)) {
        return route.fulfill({
          json: { path: requested, kind: "image", imageUrl: `/api/file/raw?path=${encodeURIComponent(requested)}&token=${token}` },
        });
      }
      return route.fulfill({
        json: {
          path: requested,
          kind: "markdown",
          text: "# Codex Remote Control Lab\n\n![Desktop UI](docs/assets/desktop-like-ui-desktop.png)\n\nLocal-first bridge UI with artifact previews and mobile controls.",
        },
      });
    }
    if (url.pathname === "/api/file/raw") {
      const requested = resolveInsideDir(root, path.resolve(root, url.searchParams.get("path") || ""));
      if (requested && fs.existsSync(requested)) {
        return route.fulfill({ path: requested, contentType: mime.get(path.extname(requested)) || "application/octet-stream" });
      }
    }
    return route.fulfill({ status: 404, json: { error: "mock route not found" } });
  });
}

async function mockWebSocket(page) {
  await page.addInitScript((payload) => {
    class MockWebSocket extends EventTarget {
      constructor() {
        super();
        this.readyState = MockWebSocket.CONNECTING;
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
        }, 100);
      }
      send() {}
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
    threadId: "thread-ocdex-v020",
    history,
    model: "gpt-5.5",
    clients: 2,
    workdir: root,
  });
}

async function newPage(browser, origin, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await mockWebSocket(page);
  await mockApi(page, origin);
  await page.goto(`${origin}/?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-state="ready"], [data-state="done"]');
  await page.waitForTimeout(250);
  return page;
}

async function snap(page, file) {
  await page.screenshot({ path: path.join(assetsDir, file), fullPage: false });
}

async function setTheme(page, theme) {
  await page.evaluate((nextTheme) => {
    localStorage.setItem("codexPhoneTheme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, theme);
  await page.waitForTimeout(150);
}

async function run() {
  fs.mkdirSync(assetsDir, { recursive: true });
  const { server, origin } = await startServer();
  let browser;
  try {
    browser = await chromium.launch();
    let page = await newPage(browser, origin, { width: 1440, height: 900 });
    await setTheme(page, "simple");
    await snap(page, "desktop-like-ui-desktop.png");
    await snap(page, "theme-simple-desktop.png");
    await setTheme(page, "cyberpunk");
    await snap(page, "theme-cyberpunk-desktop.png");
    await setTheme(page, "botanical");
    await snap(page, "theme-botanical-desktop.png");
    await page.close();

    page = await newPage(browser, origin, { width: 1280, height: 720 });
    await page.getByRole("button", { name: "desktop-like-ui-desktop.png" }).click();
    await page.waitForSelector(".artifact-preview:not(.hidden)");
    await snap(page, "chat-font-image-preview.png");
    await page.close();

    page = await newPage(browser, origin, { width: 390, height: 844 });
    await snap(page, "desktop-like-ui-mobile.png");
    await page.locator("#prompt").fill("モバイル画面で README 用のチャット状態を確認しています。");
    await page.waitForTimeout(200);
    await snap(page, "mobile-responsive-chat.png");
    await page.locator("#prompt").fill("");
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "チャット", exact: true }).click();
    await page.waitForTimeout(200);
    await snap(page, "mobile-responsive-drawer.png");
    await page.evaluate(() => document.body.classList.remove("show-sidebar"));
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector("#settingsButton").click());
    await snap(page, "theme-simple-mobile-settings.png");
    await page.locator('[data-theme-choice="cyberpunk"]').click();
    await page.waitForTimeout(250);
    await snap(page, "theme-cyberpunk-mobile-settings.png");
    await page.locator('[data-theme-choice="botanical"]').click();
    await page.waitForTimeout(250);
    await snap(page, "theme-botanical-mobile-settings.png");
    await setTheme(page, "cyberpunk");
    await page.evaluate(() => document.body.classList.remove("show-panel"));
    await snap(page, "mobile-desktop-like-controls.png");
    await page.evaluate(() => document.querySelector("#modelButton").click());
    await page.waitForTimeout(200);
    await snap(page, "mobile-model-menu.png");
    await page.close();

    console.log("Captured README screenshots in docs/assets");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  isInsideDir,
  resolveInsideDir,
};
