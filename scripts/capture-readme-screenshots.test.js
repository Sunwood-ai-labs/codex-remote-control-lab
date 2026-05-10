const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { isInsideDir, resolveInsideDir } = require("./capture-readme-screenshots");

test("isInsideDir rejects sibling directories that share a prefix", () => {
  const base = path.join(os.tmpdir(), "codex-public");
  assert.equal(isInsideDir(base, path.join(base, "index.html")), true);
  assert.equal(isInsideDir(base, base), true);
  assert.equal(isInsideDir(base, `${base}-private/secret.txt`), false);
  assert.equal(isInsideDir(base, path.join(base, "..", "secret.txt")), false);
});

test("resolveInsideDir rejects symlinks that leave the base directory", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-capture-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const base = path.join(tmp, "public");
  const outside = path.join(tmp, "outside");
  fs.mkdirSync(base);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
  fs.writeFileSync(path.join(base, "index.html"), "<h1>ok</h1>");

  const insideFile = path.join(base, "index.html");
  assert.equal(resolveInsideDir(base, insideFile), insideFile);

  const symlink = path.join(base, "linked-secret.txt");
  try {
    fs.symlinkSync(path.join(outside, "secret.txt"), symlink);
  } catch (error) {
    if (error.code === "EPERM") {
      t.skip("symlink creation is not permitted on this platform");
      return;
    }
    throw error;
  }

  assert.equal(resolveInsideDir(base, symlink), null);
});
