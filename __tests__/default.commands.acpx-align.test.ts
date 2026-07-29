import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands.js";

describe("DEFAULT_COMMANDS ACPX alignment", () => {
  it("prefers claude-agent-acp and codex-acp wrappers", () => {
    expect(DEFAULT_COMMANDS.CLAUDE_DEFAULT_COMMAND).toBe("claude-agent-acp");
    expect(DEFAULT_COMMANDS.CLAUDE_DEFAULT_ARGS).toEqual([]);
    expect(DEFAULT_COMMANDS.CODEX_DEFAULT_COMMAND).toBe("codex-acp");
    expect(DEFAULT_COMMANDS.CODEX_DEFAULT_ARGS).toEqual([]);
  });

  it("keeps Cursor on print-mode binary (ACP is via ACPX cursor-agent acp)", () => {
    expect(DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND).toBe("cursor-agent");
  });
});
