import { describe, expect, it } from "vitest";
import type { BaseCliConfig, ConfigSchema } from "../src/runtime/config";
import { baseCliConfigSchema } from "../src/runtime/config";

// Imported once at module scope rather than inside each test. As in-test dynamic imports these
// paid the module-graph cost (zod, the ACP SDK, logger.utils) against vitest's 5s per-test
// budget, which made this file fail roughly a third of the time on an otherwise busy machine.
const { createStandardAcpRuntime } = await import("../src/providers/acp.shared");

/**
 * resolveBaseConfig returns a fresh {command, args, cwd, env} object. Adapters used to hand that
 * reduced object straight to schema.parse, so every provider-specific field a caller set was
 * discarded before it could reach the CLI.
 */
describe("provider config passthrough", () => {
  it("keeps provider-specific fields when the shared ACP runtime resolves config", async () => {
    const seen: unknown[] = [];
    const capturingSchema = {
      parse: (value: unknown) => {
        seen.push(value);
        return baseCliConfigSchema.parse(value);
      },
    } as ConfigSchema<BaseCliConfig>;

    createStandardAcpRuntime(
      {
        command: "claude-agent-acp",
        args: [],
        env: {},
        model: "claude-sonnet-4.6",
        verbose: true,
      } as unknown as BaseCliConfig,
      { command: "claude-agent-acp", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      capturingSchema
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      command: "claude-agent-acp",
      model: "claude-sonnet-4.6",
      verbose: true,
    });
  });

  it("lets resolved base fields win over the caller's originals", async () => {
    const seen: unknown[] = [];
    const capturingSchema = {
      parse: (value: unknown) => {
        seen.push(value);
        return baseCliConfigSchema.parse(value);
      },
    } as ConfigSchema<BaseCliConfig>;

    createStandardAcpRuntime(
      {
        command: "explicit-binary",
        args: ["--from-caller"],
        env: {},
        model: "m",
      } as unknown as BaseCliConfig,
      { command: "default-binary", args: ["--from-defaults"] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      capturingSchema
    );

    expect(seen[0]).toMatchObject({
      command: "explicit-binary",
      args: ["--from-caller"],
      model: "m",
    });
  });

  it("labels OpenAI-style envelopes with the configured model", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const capturingSchema = {
      parse: (value: unknown) => {
        captured.push(value as Record<string, unknown>);
        return baseCliConfigSchema.parse(value);
      },
    } as ConfigSchema<BaseCliConfig>;

    const port = createStandardAcpRuntime(
      {
        command: "claude-agent-acp",
        args: [],
        env: {},
        model: "claude-opus-4.5",
      } as unknown as BaseCliConfig,
      { command: "claude-agent-acp", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      capturingSchema
    );

    expect(port).toBeDefined();
    expect(captured[0]?.model).toBe("claude-opus-4.5");
  });
});
