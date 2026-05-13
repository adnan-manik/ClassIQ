// Scan recent transcripts for Bash + MCP tool calls and tally them.
//   node scan_tools.mjs <sessions-list-file>

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";

const sessionsFile = process.argv[2];
const sessions = readFileSync(sessionsFile, "utf8")
  .split(/\r?\n/)
  .filter(Boolean);

const bashCounts = new Map(); // pattern -> count
const mcpCounts = new Map();

function bashPatternFromCommand(cmd) {
  if (!cmd || typeof cmd !== "string") return null;
  let s = cmd.trim();

  // Strip leading env-var assignments like FOO=bar BAR='baz'
  while (/^[A-Z_][A-Z0-9_]*=/.test(s)) {
    s = s.replace(/^[A-Z_][A-Z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s*/, "");
  }

  // Take the first segment before any pipe/and/or/semicolon
  s = s.split(/[|;&]| && | \|\| /)[0].trim();

  const tokens = s.split(/\s+/);
  if (!tokens.length) return null;

  // Strip leading "sudo", "timeout 10s", "nohup", etc.
  while (
    tokens.length > 1 &&
    /^(sudo|nohup|stdbuf|timeout|env|nice|ionice)$/.test(tokens[0])
  ) {
    tokens.shift();
    if (/^[A-Z_][A-Z0-9_]*=/.test(tokens[0] || "")) continue;
    // strip flag arg pairs of timeout etc
    if (tokens[0]?.startsWith("-") || /^\d+[smhd]?$/.test(tokens[0] || "")) {
      tokens.shift();
    }
  }

  const head = tokens[0];
  const sub = tokens[1];
  if (!head) return null;

  // For commands with subcommand semantics, key on "head sub"
  const SUBCOMMAND_TOOLS = new Set([
    "git",
    "gh",
    "npm",
    "npx",
    "yarn",
    "pnpm",
    "bun",
    "docker",
    "kubectl",
    "supabase",
    "vercel",
    "claude",
  ]);
  if (SUBCOMMAND_TOOLS.has(head) && sub && !sub.startsWith("-")) {
    return `${head} ${sub}`;
  }
  return head;
}

let processed = 0;
for (const file of sessions) {
  if (!file) continue;
  try {
    const rl = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = obj?.message;
      if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) {
        continue;
      }
      for (const part of msg.content) {
        if (part?.type !== "tool_use") continue;
        const name = part.name;
        if (name === "Bash") {
          const cmd = part.input?.command;
          const pat = bashPatternFromCommand(cmd);
          if (pat) bashCounts.set(pat, (bashCounts.get(pat) ?? 0) + 1);
        } else if (typeof name === "string" && name.startsWith("mcp__")) {
          mcpCounts.set(name, (mcpCounts.get(name) ?? 0) + 1);
        }
      }
    }
    processed++;
  } catch (err) {
    console.error(`skip ${file}: ${err.message}`);
  }
}

console.error(`Processed ${processed} sessions.\n`);

const sortDesc = (m) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]);

console.log("=== BASH (head [+ subcommand]) ===");
for (const [pat, n] of sortDesc(bashCounts)) {
  if (n < 2) continue;
  console.log(`${String(n).padStart(4)}  ${pat}`);
}
console.log("\n=== MCP ===");
for (const [pat, n] of sortDesc(mcpCounts)) {
  if (n < 2) continue;
  console.log(`${String(n).padStart(4)}  ${pat}`);
}
