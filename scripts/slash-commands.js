const fs = require("fs");
const path = require("path");

const builtInSlashCommands = [
  {
    name: "compact",
    kind: "app-server",
    usage: "/compact",
    description: "現在の thread を app-server compaction で要約します。",
  },
  {
    name: "diff",
    kind: "shell",
    usage: "/diff [full]",
    description: "現在の thread に Git diff の要約を表示します。",
  },
  {
    name: "review",
    kind: "prompt",
    usage: "/review",
    description: "現在の working tree を Codex にレビューさせます。",
  },
  {
    name: "goal",
    kind: "prompt",
    usage: "/goal [objective]",
    description: "現在の session goal を設定または確認します。",
  },
  {
    name: "status",
    kind: "client",
    usage: "/status",
    description: "bridge status panel を開きます。",
  },
  {
    name: "new",
    kind: "client",
    usage: "/new",
    description: "保存済み state を使わず新しい chat を開始します。",
  },
  {
    name: "commands",
    aliases: ["help"],
    kind: "client",
    usage: "/commands",
    description: "利用可能な slash commands を表示します。",
  },
];

function parseSlashInput(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("/")) return null;
  const match = raw.match(/^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return {
    raw,
    command: match[1].toLowerCase(),
    args: (match[2] || "").trim(),
  };
}

function normalizeCommand(command) {
  const aliases = Array.isArray(command.aliases) ? command.aliases : [];
  const name = String(command.name || "").replace(/^\//, "").toLowerCase();
  return {
    name,
    aliases: aliases.map((alias) => String(alias).replace(/^\//, "").toLowerCase()),
    kind: command.kind || "prompt",
    usage: command.usage || `/${name}`,
    description: command.description || "",
    template: command.template || command.prompt || "",
    command: command.command || "",
  };
}

function readSlashCommandExtensions(root, env = process.env) {
  const configuredPath = env.PHONE_SLASH_COMMANDS_FILE || path.join(root, "slash-commands.local.json");
  try {
    if (!fs.existsSync(configuredPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(configuredPath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCommand).filter((command) => command.name && ["prompt", "shell"].includes(command.kind));
  } catch {
    return [];
  }
}

function readSlashCommands(root, env = process.env) {
  const commands = [...builtInSlashCommands.map(normalizeCommand), ...readSlashCommandExtensions(root, env)];
  const seen = new Set();
  return commands.filter((command) => {
    if (seen.has(command.name)) return false;
    seen.add(command.name);
    return true;
  });
}

function findSlashCommand(commands, name) {
  const normalized = String(name || "").replace(/^\//, "").toLowerCase();
  return commands.find((command) => command.name === normalized || command.aliases.includes(normalized)) || null;
}

function renderSlashTemplate(template, args, parsed) {
  return String(template || "")
    .replaceAll("{{args}}", args || "")
    .replaceAll("{{command}}", parsed?.command || "");
}

module.exports = {
  builtInSlashCommands,
  findSlashCommand,
  parseSlashInput,
  readSlashCommands,
  renderSlashTemplate,
};
