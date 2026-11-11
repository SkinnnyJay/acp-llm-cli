import { describe, expect, it } from "vitest";
import { antigravityConfigSchema } from "../src/providers/antigravity/schema";
import { claudeConfigSchema } from "../src/providers/claude/schema";
import { codexConfigSchema } from "../src/providers/codex/schema";
import { cursorConfigSchema } from "../src/providers/cursor/schema";

/**
 * App HarnessConfig-style shapes: command, args, env, cwd plus provider-specific options.
 * Validates that acp-llm-cli provider schemas accept these for replacement parity.
 */
describe("Provider config parity with app HarnessConfig", () => {
  it("Claude: accepts app-style config", () => {
    const config = {
      command: "claude-code-acp",
      args: [] as string[],
      env: {} as Record<string, string>,
      cwd: "/project",
      model: "claude-sonnet-4-20250514",
    };
    expect(() => claudeConfigSchema.parse(config)).not.toThrow();
    expect(claudeConfigSchema.parse(config).command).toBe("claude-code-acp");
  });

  it("Antigravity: accepts app-style config", () => {
    const config = {
      command: "agy",
      args: ["acp"],
      env: {},
      cwd: "/project",
    };
    expect(() => antigravityConfigSchema.parse(config)).not.toThrow();
  });

  it("Codex: accepts app-style config", () => {
    const config = {
      command: "codex",
      args: ["--acp"],
      env: {},
    };
    expect(() => codexConfigSchema.parse(config)).not.toThrow();
  });

  it("Cursor: accepts app-style config", () => {
    const config = {
      command: "cursor-agent",
      args: ["acp"],
      env: {},
      cwd: "/project",
      model: "claude-sonnet-4-20250514",
    };
    expect(() => cursorConfigSchema.parse(config)).not.toThrow();
    expect(cursorConfigSchema.parse(config).model).toBe("claude-sonnet-4-20250514");
  });

  it("Cursor: accepts minimal config", () => {
    expect(() => cursorConfigSchema.parse({ command: "cursor-agent", args: [] })).not.toThrow();
  });
});
