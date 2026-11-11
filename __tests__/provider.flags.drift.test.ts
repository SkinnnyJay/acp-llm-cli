import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CLI_ARG } from "../src/providers/claude/constants";
import { CODEX_CLI_ARG } from "../src/providers/codex/constants";
import { CURSOR_CLI_ARG } from "../src/providers/cursor/constants";
import { GEMINI_CLI_ARG } from "../src/providers/gemini/constants";

const TABLES: Record<string, Record<string, string>> = {
  claude: CLAUDE_CLI_ARG,
  codex: CODEX_CLI_ARG,
  cursor: CURSOR_CLI_ARG,
  gemini: GEMINI_CLI_ARG,
};

/** Every flag token (`-p`, `--model`) that appears in a help text. */
function flagsIn(help: string): Set<string> {
  return new Set(help.match(/(?<![\w-])--?[A-Za-z][\w-]*/g) ?? []);
}

describe("provider flag tables match the spawned binary's --help", () => {
  for (const [provider, table] of Object.entries(TABLES)) {
    it(`${provider}: every declared flag exists in the saved help`, () => {
      const help = readFileSync(join(__dirname, "fixtures", "help", `${provider}.txt`), "utf8");
      const known = flagsIn(help);
      const unknown = Object.values(table).filter((flag) => !known.has(flag));
      expect(unknown).toEqual([]);
    });
  }

  for (const [provider, table] of Object.entries(TABLES)) {
    if (Object.keys(table).length > 0) continue;
    it(`${provider}: empty flag table, so its fixture must have no help body`, () => {
      const help = readFileSync(join(__dirname, "fixtures", "help", `${provider}.txt`), "utf8");
      const body = help
        .split("\n")
        .slice(1)
        .filter((line) => line.trim() !== "" && !line.startsWith("$ "));
      expect(body).toEqual([]);
    });
  }

  it("flagsIn does not treat hyphenated words as flags", () => {
    expect([...flagsIn("use stream-json with --output-format or -p")]).toEqual([
      "--output-format",
      "-p",
    ]);
  });
});
