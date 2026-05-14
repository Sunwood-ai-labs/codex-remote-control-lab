const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-phone-workdir-"));
const workdir = path.join(tempRoot, "active-workspace");
fs.mkdirSync(workdir, { recursive: true });
process.env.CODEX_WORKDIR = workdir;
process.env.CODEX_HOME = path.join(tempRoot, "codex-home");

const {
  bridgeClassForProvider,
  clearLastThreadId,
  discoverWorkspaceEntries,
  installedLocalSkillEntries,
  installedSkillsFromPluginMarketplaces,
  isMissingThreadError,
  mergeSkillEntries,
  parseRefreshCommand,
  readDirectoryListing,
  readLastThreadCwd,
  readLastThreadId,
  readSkills,
  reviewSummary,
  safeDirectoryPath,
  safeOpenPath,
  writeLastThreadCwd,
  writeLastThreadId,
} = require("./start-phone");

function runGit(args) {
  const result = spawnSync("git", args, { cwd: workdir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return result.stdout;
}

test("discoverWorkspaceEntries walks CODEX_WORKDIR instead of the bridge repo root", async () => {
  fs.writeFileSync(path.join(workdir, "active-only.md"), "# active\n", "utf8");
  fs.writeFileSync(path.join(workdir, ".env"), "SECRET=hidden\n", "utf8");

  const entries = await discoverWorkspaceEntries({ limit: 20 });
  const paths = entries.map((entry) => entry.path);

  assert.ok(paths.includes("active-only.md"));
  assert.ok(!paths.includes(".env"));
});

test("safeOpenPath prefers same-named files from CODEX_WORKDIR", () => {
  const activeReadme = path.join(workdir, "README.md");
  fs.writeFileSync(activeReadme, "# active workspace\n", "utf8");

  assert.equal(safeOpenPath("README.md"), activeReadme);
});

test("reviewSummary marks CODEX_WORKDIR git paths as openable", async () => {
  runGit(["init"]);
  runGit(["config", "user.email", "test@example.com"]);
  runGit(["config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(workdir, "review.md"), "before\n", "utf8");
  fs.writeFileSync(path.join(workdir, "review file.md"), "before\n", "utf8");
  runGit(["add", "review.md", "review file.md"]);
  runGit(["commit", "-m", "initial"]);
  fs.writeFileSync(path.join(workdir, "review.md"), "before\nafter\n", "utf8");
  fs.writeFileSync(path.join(workdir, "review file.md"), "before\nafter\n", "utf8");

  const summary = await reviewSummary();
  const reviewFile = summary.files.find((file) => file.path === "review.md");
  const spacedFile = summary.files.find((file) => file.path === "review file.md");

  assert.equal(summary.source, "working tree");
  assert.equal(reviewFile?.openable, true);
  assert.equal(reviewFile?.kind, "markdown");
  assert.equal(spacedFile?.openable, true);
  assert.equal(spacedFile?.additions, 1);
});

test("last-thread persistence writes, reads, and clears only matching private local state", () => {
  const threadPath = path.join(tempRoot, "last-thread");
  const cwdPath = path.join(tempRoot, "last-thread-cwd");

  assert.equal(readLastThreadId(threadPath), "");
  assert.equal(readLastThreadCwd(cwdPath), "");

  writeLastThreadId("thread-123", threadPath);
  writeLastThreadCwd(workdir, cwdPath);

  assert.equal(readLastThreadId(threadPath), "thread-123");
  assert.equal(readLastThreadCwd(cwdPath), workdir);

  clearLastThreadId(undefined, { threadPath, cwdPath });
  assert.equal(readLastThreadId(threadPath), "thread-123");

  clearLastThreadId("", { threadPath, cwdPath });
  assert.equal(readLastThreadId(threadPath), "thread-123");

  clearLastThreadId("other-thread", { threadPath, cwdPath });
  assert.equal(readLastThreadId(threadPath), "thread-123");

  clearLastThreadId("thread-123", { threadPath, cwdPath });
  assert.equal(readLastThreadId(threadPath), "");
  assert.equal(readLastThreadCwd(cwdPath), "");
});

test("missing thread errors are detected narrowly for stale resume recovery", () => {
  assert.equal(isMissingThreadError("no rollout found for thread id thread-123"), true);
  assert.equal(isMissingThreadError("Thread not found"), true);
  assert.equal(isMissingThreadError("thread id not found"), true);
  assert.equal(isMissingThreadError("no thread found"), true);
  assert.equal(isMissingThreadError("connection closed"), false);
  assert.equal(isMissingThreadError("Model not found"), false);
  assert.equal(isMissingThreadError("API key not found"), false);
});

test("upstream disconnect cleanup preserves queued turns instead of restarting on a closed socket", () => {
  const source = fs.readFileSync(path.join(__dirname, "start-phone.js"), "utf8");

  assert.match(source, /finishInterruptedTurn\(error\.message,\s*\{\s*restartQueued:\s*false\s*\}\)/);
  assert.match(source, /finishInterruptedTurn\(reason,\s*\{\s*restartQueued\s*=\s*true\s*\}\s*=\s*\{\s*\}\)/);
  assert.match(source, /if \(restartQueued\) this\.startNextQueuedTurn\(\);/);
});

test("bridge selection keeps Claude provider off the Codex app-server bridge", () => {
  assert.equal(bridgeClassForProvider("codex").name, "SharedBridge");
  assert.equal(bridgeClassForProvider("claude").name, "ClaudeBridge");
});

test("newly created threads persist their cwd mapping for explicit reconnects", () => {
  const source = fs.readFileSync(path.join(__dirname, "start-phone.js"), "utf8");

  assert.match(source, /threadCwdMap\.set\(this\.threadId,\s*this\.cwd\);/);
  assert.doesNotMatch(source, /if \(this\.requestedThreadId\)\s*\{\s*threadCwdMap\.set\(this\.threadId,\s*this\.cwd\);/);
});

test("slash command app-server turns stay active after request acknowledgement", () => {
  const source = fs.readFileSync(path.join(__dirname, "start-phone.js"), "utf8");

  assert.match(source, /if \(pendingMethod === "thread\/compact\/start" \|\| pendingMethod === "thread\/shellCommand"\)/);
  assert.match(source, /this\.setBridgeRunState\("running", pendingMethod === "thread\/compact\/start" \? "Compaction 実行中" : "Shell command 実行中", this\.activeTurnId\);/);
  assert.match(source, /this\.activeTurnId = crypto\.randomUUID\(\);\s*this\.setBridgeRunState\("running", "Compaction 実行中", this\.activeTurnId\);/);
  assert.match(source, /this\.activeTurnId = crypto\.randomUUID\(\);\s*this\.setBridgeRunState\("running", "Shell command 実行中", this\.activeTurnId\);/);
});

test("safeDirectoryPath and readDirectoryListing stay inside the provided root", () => {
  const homeRoot = path.join(tempRoot, "home");
  const child = path.join(homeRoot, "project-a");
  const hidden = path.join(homeRoot, ".hidden-project");
  const outside = path.join(tempRoot, "outside-home");
  const outsideLink = path.join(homeRoot, "outside-link");
  fs.mkdirSync(child, { recursive: true });
  fs.mkdirSync(hidden, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, outsideLink, "dir");

  assert.equal(safeDirectoryPath(child, homeRoot)?.absolute, fs.realpathSync(child));
  assert.equal(safeDirectoryPath(path.dirname(homeRoot), homeRoot), null);
  assert.equal(safeDirectoryPath(outsideLink, homeRoot), null);

  const visibleListing = readDirectoryListing(homeRoot, false, homeRoot);
  assert.deepEqual(visibleListing.entries.map((entry) => entry.name), ["project-a"]);

  const hiddenListing = readDirectoryListing(homeRoot, true, homeRoot);
  assert.deepEqual(hiddenListing.entries.map((entry) => entry.name), [".hidden-project", "project-a"]);
});

test("readSkills returns public skill metadata without absolute paths", () => {
  const codexHome = path.join(tempRoot, "read-skills-home");
  const skillDir = path.join(codexHome, "skills", "sample-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\ndescription: Sample workflow\n---\n\n# Sample Skill\n",
    "utf8",
  );

  const skills = readSkills({ codexSkillsDir: path.join(codexHome, "skills"), agentSkillsDir: "" });
  assert.deepEqual(skills, [
    { name: "sample-skill", description: "Sample workflow", source: "codex" },
  ]);
  assert.deepEqual(Object.keys(skills[0]).sort(), ["description", "name", "source"]);
  assert.equal(JSON.stringify(skills).includes(codexHome), false);
});

test("installedSkillsFromPluginMarketplaces reads installed plugin SKILL.md files", () => {
  const pluginRoot = path.join(tempRoot, "plugins", "browser-use");
  const skillDir = path.join(pluginRoot, "skills", "browser");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: browser\ndescription: Browser automation from a skill file\n---\n\n# Browser\n",
    "utf8",
  );

  const skills = installedSkillsFromPluginMarketplaces([
    {
      id: "openai-bundled",
      plugins: [
        {
          summary: { id: "browser-use@openai-bundled", name: "browser-use", installed: true },
          source: { type: "local", path: pluginRoot },
        },
        {
          summary: { id: "available@openai-bundled", name: "available", installed: false },
          source: { type: "local", path: path.join(tempRoot, "plugins", "available") },
        },
      ],
    },
  ]);

  assert.deepEqual(
    skills.map((skill) => ({ id: skill.id, name: skill.name, trigger: skill.trigger, description: skill.description })),
    [
      {
        id: "browser-use:browser",
        name: "browser-use:browser",
        trigger: "/browser-use:browser",
        description: "Browser automation from a skill file",
      },
    ],
  );
});

test("installedLocalSkillEntries reads normal CODEX_HOME skills", () => {
  const skillDir = path.join(process.env.CODEX_HOME, "skills", "gh-release-notes");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: gh-release-notes\ndescription: Release note drafting\n---\n\n# Release notes\n",
    "utf8",
  );

  const skills = installedLocalSkillEntries(process.env.CODEX_HOME);

  assert.deepEqual(
    skills.map((skill) => ({ id: skill.id, name: skill.name, trigger: skill.trigger, description: skill.description })),
    [
      {
        id: "gh-release-notes",
        name: "gh-release-notes",
        trigger: "/gh-release-notes",
        description: "Release note drafting",
      },
    ],
  );
});

test("mergeSkillEntries returns plugin and local skills together", () => {
  const skills = mergeSkillEntries(
    [{ id: "browser-use:browser", name: "browser-use:browser", trigger: "/browser-use:browser" }],
    [{ id: "gh-release-notes", name: "gh-release-notes", trigger: "/gh-release-notes" }],
  );

  assert.deepEqual(
    skills.map((skill) => skill.trigger),
    ["/browser-use:browser", "/gh-release-notes"],
  );
});

test("parseRefreshCommand rejects shell metacharacters and returns argv", () => {
  assert.deepEqual(parseRefreshCommand("node scripts/read-desktop-rate-limits.js"), {
    command: "node",
    args: ["scripts/read-desktop-rate-limits.js"],
  });
  assert.throws(() => parseRefreshCommand("node scripts/read-desktop-rate-limits.js | cat"), /shell metacharacters/);
});
