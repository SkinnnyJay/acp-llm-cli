import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands.js";

describe("DEFAULT_COMMANDS ACPX alignment", () => {
  it("prefers claude-agent-acp and codex-acp wrappers", () => {
    expect(DEFAULT_COMMANDS.CLAUDE_DEFAULT_COMMAND).toBe("claude-agent-acp");
    expect(DEFAULT_COMMANDS.CLAUDE_DEFAULT_ARGS).toEqual([]);
    expect(DEFAULT_COMMANDS.CODEX_DEFAULT_COMMAND).toBe("codex-acp");
    expect(DEFAULT_COMMANDS.CODEX_DEFAULT_ARGS).toEqual([]);
  });

  it("starts Antigravity in ACP mode with the acp subcommand", () => {
    expect(DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_ARGS).toEqual(["acp"]);
  });

  it("spawns the cursor-agent binary (its ACP server is started with the acp argument)", () => {
    expect(DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND).toBe("cursor-agent");
  });
});
