/**
 * Live provider matrix — Claude / Codex / Gemini / Cursor against real CLIs.
 *
 * Skip by default. Enable:
 *   ACP_LLM_CLI_LIVE=1 npm test -- __tests__/live.providers.matrix.test.ts
 * Optional filter: ACP_LLM_CLI_PROVIDER=claude|codex|gemini|cursor
 *
 * When LIVE=1, asserts connect → initialize → newSession → short prompt → disconnect.
 * Missing binaries fail the test (no soft-pass).
 *
 * Cursor in this package uses print/stream-json (not ACP). Others use ACP stdio.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands.js";
import { ENV_KEY } from "../src/domain/env.keys.js";
import { PROVIDER_IDS } from "../src/domain/provider.ids.js";
import { getDefaultFactory } from "../src/index.js";

const LIVE = process.env[ENV_KEY.ACP_LLM_CLI_LIVE] === "1";
const FILTER = process.env[ENV_KEY.ACP_LLM_CLI_PROVIDER];

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
    id: "gemini",
    providerId: PROVIDER_IDS.GEMINI_CLI_ID,
    command: DEFAULT_COMMANDS.GEMINI_DEFAULT_COMMAND,
    args: [...DEFAULT_COMMANDS.GEMINI_DEFAULT_ARGS],
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

// A filter that matches nothing would otherwise let a deliberate live run report green having
// contacted no CLI at all.
if (LIVE && CASES.length === 0) {
  throw new Error(
    `${ENV_KEY.ACP_LLM_CLI_PROVIDER}="${FILTER}" matched no provider; expected one of: claude, codex, gemini, cursor`
  );
}

describe.skipIf(!LIVE)("live provider matrix", () => {
  it.each(CASES)(
    "$id connect → initialize → newSession → prompt → disconnect",
    async (c) => {
      const factory = getDefaultFactory();
      const port = factory.createRuntime(c.providerId, {
        command: c.command,
        args: c.args,
        cwd: process.cwd(),
      });

      expect(port).toBeTruthy();
      expect(port.capabilities).toBeDefined();

      await port.connect();
      const init = await port.initialize();
      expect(init).toHaveProperty("protocolVersion");

      const session = await port.newSession({ cwd: process.cwd(), mcpServers: [] });
      expect(typeof session.sessionId).toBe("string");

      if (session.sessionId) {
        const promptRes = await port.prompt({
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "Reply with exactly: ok" }],
        });
        expect(promptRes).toHaveProperty("stopReason");
      }

      await port.disconnect();
    },
    120_000
  );
});
