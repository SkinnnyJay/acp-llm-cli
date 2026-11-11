#!/usr/bin/env node
// Saves the --help output of each binary this package spawns, so the flag tables in
// src/providers/*/constants.ts can be checked against what the binary really accepts.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "__tests__", "fixtures", "help");

// One entry per provider: every invocation whose help contributes accepted flags.
const TARGETS = {
  claude: { bin: "claude-agent-acp", help: [["--help"]], version: ["--version"] },
  codex: { bin: "codex-acp", help: [["--help"]], version: ["--version"] },
  cursor: { bin: "cursor-agent", help: [["--help"], ["acp", "--help"]], version: ["--version"] },
  gemini: { bin: "gemini", help: [["--help"]], version: ["--version"] },
};

/** Returns the output, "" when the binary ran but timed out, or undefined when it cannot spawn. */
function run(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error && result.error.code !== "ETIMEDOUT") return undefined;
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  // Keep machine-specific paths out of the saved fixtures.
  return text.split(homedir()).join("~");
}

mkdirSync(outDir, { recursive: true });
for (const [provider, target] of Object.entries(TARGETS)) {
  const version = run(target.bin, target.version);
  if (version === undefined) {
    console.log(`skip ${provider}: ${target.bin} is not installed`);
    continue;
  }
  const sections = target.help.map((args) => `$ ${target.bin} ${args.join(" ")}\n${run(target.bin, args) ?? ""}`);
  const body = `# ${target.bin} ${version.split("\n")[0]}\n\n${sections.join("\n\n")}\n`;
  writeFileSync(join(outDir, `${provider}.txt`), body);
  console.log(`wrote ${provider}.txt`);
}
