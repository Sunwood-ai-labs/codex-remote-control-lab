const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs");

function walkMarkdown(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(target, files);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

function localImageRefs(markdown) {
  const refs = [];
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const ref = match[1];
    if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:") || ref.startsWith("#")) continue;
    refs.push(ref.split(/[?#]/)[0]);
  }
  return refs;
}

function resolveDocsImage(markdownFile, ref) {
  if (ref.startsWith("/")) return path.join(docsRoot, "public", ref.slice(1));
  return path.resolve(path.dirname(markdownFile), ref);
}

test("docs markdown image references resolve to tracked docs assets", () => {
  const missing = [];
  for (const file of walkMarkdown(docsRoot)) {
    const markdown = fs.readFileSync(file, "utf8");
    for (const ref of localImageRefs(markdown)) {
      const resolved = resolveDocsImage(file, ref);
      if (!fs.existsSync(resolved)) missing.push(`${path.relative(repoRoot, file)} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});
