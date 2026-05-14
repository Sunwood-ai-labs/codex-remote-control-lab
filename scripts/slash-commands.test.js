const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findSlashCommand,
  parseSlashInput,
  publicSlashCommandMetadata,
  readSlashCommands,
  renderSlashTemplate,
  slashCommandMetadata,
  slashShellCommand,
} = require("./slash-commands");

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

test("loads prompt slash command extensions but rejects local shell extensions", () => {
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
  assert.equal(findSlashCommand(commands, "shortstat"), null);
  assert.equal(findSlashCommand(commands, "ignored"), null);
});

test("renders extension prompt templates", () => {
  assert.equal(renderSlashTemplate("review {{args}} from /{{command}}", "src", { command: "x" }), "review src from /x");
});

test("shell commands are restricted to fixed built-in mappings", () => {
  const diff = findSlashCommand(readSlashCommands(process.cwd(), {}), "diff");

  assert.equal(slashShellCommand(diff, { args: "" }), "git status --short && git diff --stat");
  assert.equal(slashShellCommand(diff, { args: "full" }), "git diff -- .");
  assert.equal(slashShellCommand({ name: "local", kind: "shell", command: "ls {{args}}" }, { args: "; rm -rf /" }), "");
});

test("slash command metadata hides templates and shell command bodies", () => {
  const metadata = slashCommandMetadata({
    name: "handoff",
    aliases: ["h"],
    kind: "prompt",
    usage: "/handoff [topic]",
    description: "handoff",
    command: "secret shell",
    template: "secret prompt",
    requiresArgs: true,
  });

  assert.deepEqual(metadata, {
    name: "handoff",
    aliases: ["h"],
    kind: "prompt",
    usage: "/handoff [topic]",
    description: "handoff",
    requiresArgs: true,
  });
});

test("public slash command metadata does not expose prompt templates or shell bodies", () => {
  const metadata = publicSlashCommandMetadata([
    { name: "handoff", kind: "prompt", aliases: [], usage: "/handoff", description: "handoff", template: "secret {{args}}", requiresArgs: true },
    { name: "diff", kind: "shell", aliases: [], usage: "/diff", description: "diff", command: "git diff --stat", requiresArgs: false },
  ]);
  assert.deepEqual(metadata, [
    { name: "handoff", aliases: [], kind: "prompt", usage: "/handoff", description: "handoff", requiresArgs: true },
    { name: "diff", aliases: [], kind: "shell", usage: "/diff", description: "diff", requiresArgs: false },
  ]);
  assert.equal(Object.hasOwn(metadata[0], "template"), false);
  assert.equal(Object.hasOwn(metadata[1], "command"), false);
});
