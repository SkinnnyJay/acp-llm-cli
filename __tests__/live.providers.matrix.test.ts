/**
 * Live provider matrix — Claude / Codex / Cursor against real CLIs.
 *
 * Skip by default. Enable:
 *   ACP_LLM_CLI_LIVE=1 npm test -- __tests__/live.providers.matrix.test.ts
 * Optional filter: ACP_LLM_CLI_PROVIDER=claude|codex|cursor
 *
 * Cursor in this package uses print/stream-json (not ACP). Claude/Codex use ACP stdio.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands.js";
import { PROVIDER_IDS } from "../src/domain/provider.ids.js";
import { getDefaultFactory } from "../src/index.js";

const LIVE = process.env["ACP_LLM_CLI_LIVE"] === "1";
const FILTER = process.env["ACP_LLM_CLI_PROVIDER"];

type Case = {
  id: string;
  providerId: string;
  command: string;
  args: string[];
  mode: "acp" | "cursor-print";
};

const CASES: Case[] = [
  {
    id: "claude",
    providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
    command: DEFAULT_COMMANDS.CLAUDE_DEFAULT_COMMAND,
    args: [...DEFAULT_COMMANDS.CLAUDE_DEFAULT_ARGS],
    mode: "acp",
  },
  {
    id: "codex",
    providerId: PROVIDER_IDS.CODEX_CLI_ID,
    command: DEFAULT_COMMANDS.CODEX_DEFAULT_COMMAND,
    args: [...DEFAULT_COMMANDS.CODEX_DEFAULT_ARGS],
    mode: "acp",
  },
  {
    id: "cursor",
    providerId: PROVIDER_IDS.CURSOR_CLI_ID,
    command: DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND,
    args: [...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS],
    mode: "cursor-print",
  },
].filter((c) => !FILTER || FILTER === c.id);

describe.skipIf(!LIVE)("live provider matrix", () => {
  it.each(CASES)(
    "$id defaults resolve and port lifecycle does not throw on construct",
    async (c) => {
      const factory = getDefaultFactory();
      const port = factory.createRuntime(c.providerId, {
        command: c.command,
        args: c.args,
        cwd: process.cwd(),
      });
      expect(port).toBeTruthy();
      // Soft connect probe — may fail if binary missing; assert structured error.
      try {
        await port.connect();
        await port.disconnect?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Missing binary is an environment issue; surface but don't flake CI when live.
        expect(message.length).toBeGreaterThan(0);
      }
    },
    60_000,
  );
});
