const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const styleCss = fs.readFileSync(path.join(root, "public/style.css"), "utf8");
const mainJs = fs.readFileSync(path.join(root, "public/main.js"), "utf8");
const buildUi = fs.readFileSync(path.join(root, "scripts/build-ui.mjs"), "utf8");

test("mobile text inputs keep a 16px font to avoid iOS focus zoom", () => {
  assert.match(styleCss, /textarea\s*\{[\s\S]*?font-size:\s*16px;/);
  assert.match(styleCss, /@media \(hover: none\)\s*\{[\s\S]*?textarea,\s*input,\s*select\s*\{[\s\S]*?font-size:\s*16px;/);
  assert.match(styleCss, /@media \(max-width: 820px\)\s*\{[\s\S]*?textarea,\s*input,\s*select\s*\{[\s\S]*?font-size:\s*16px;/);
});

test("mobile layout avoids viewport-width sizing that can preserve a zoomed canvas", () => {
  assert.doesNotMatch(styleCss, /\b100vw\b/);
});

test("browser restores the viewport meta after an input-triggered visual zoom", () => {
  assert.match(buildUi, /viewport-fit=cover/);
  assert.match(mainJs, /function resetViewportScaleAfterInput\(\)/);
  assert.match(mainJs, /window\.visualViewport\.scale <= 1\.01/);
  assert.match(mainJs, /maximum-scale=1/);
  assert.match(mainJs, /setTimeout\(\(\) => viewportMeta\.setAttribute\("content", stableViewportContent\), 260\)/);
});
