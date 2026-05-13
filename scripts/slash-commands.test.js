const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { findSlashCommand, parseSlashInput, readSlashCommands, renderSlashTemplate } = require("./slash-commands");

test("parses slash command name and args", () => {
  assert.deepEqual(parseSlashInput(" /compact "), { raw: "/compact", command: "compact", args: "" });
  assert.deepEqual(parseSlashInput("/goal ship it"), { raw: "/goal ship it", command: "goal", args: "ship it" });
  assert.equal(parseSlashInput("regular prompt"), null);
});

test("exposes bridge-native built-in slash commands", () => {
  const commands = readSlashCommands(process.cwd(), {});
  assert.ok(findSlashCommand(commands, "compact"));
  assert.ok(findSlashCommand(commands, "diff"));
  assert.ok(findSlashCommand(commands, "review"));
  assert.ok(findSlashCommand(commands, "goal"));
  assert.ok(findSlashCommand(commands, "commands"));
  assert.equal(findSlashCommand(commands, "help").name, "commands");
});

test("loads prompt and shell slash command extensions from local json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-slash-"));
  const file = path.join(dir, "slash.json");
  fs.writeFileSync(
    file,
    JSON.stringify([
      { name: "handoff", kind: "prompt", template: "handoff: {{args}}" },
      { name: "shortstat", kind: "shell", command: "git diff --shortstat" },
      { name: "ignored", kind: "app-server" },
    ]),
  );

  const commands = readSlashCommands(dir, { PHONE_SLASH_COMMANDS_FILE: file });
  assert.equal(findSlashCommand(commands, "handoff").kind, "prompt");
  assert.equal(findSlashCommand(commands, "shortstat").kind, "shell");
  assert.equal(findSlashCommand(commands, "ignored"), null);
});

test("renders extension prompt templates", () => {
  assert.equal(renderSlashTemplate("review {{args}} from /{{command}}", "src", { command: "x" }), "review src from /x");
});
