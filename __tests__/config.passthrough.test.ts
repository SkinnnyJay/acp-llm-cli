import { describe, expect, it, vi } from "vitest";
import { CURSOR_CLI_ARG } from "../src/providers/cursor/constants";
import type { BaseCliConfig, ConfigSchema } from "../src/runtime/config";
import { baseCliConfigSchema } from "../src/runtime/config";

const { spawnCalls } = vi.hoisted(() => ({
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
}));

vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  const { Readable, Writable } = await import("node:stream");
  return {
    spawn: (command: string, args: string[]) => {
      spawnCalls.push({ command, args });
      const emitter = new EventEmitter();
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const stdin = new Writable({
        write(_c, _e, cb) {
          cb();
        },
      });
      const child = Object.assign(emitter, { stdout, stderr, stdin, kill: vi.fn(), pid: 7 });
      setTimeout(() => {
        stdout.push(null);
        stderr.push(null);
        child.emit("close", 0, null);
      }, 0);
      return child;
    },
  };
});

// Imported once at module scope rather than inside each test. As in-test dynamic imports these
// paid the module-graph cost (zod, the ACP SDK, logger.utils) against vitest's 5s per-test
// budget, which made this file fail roughly a third of the time on an otherwise busy machine.
// vi.mock above is hoisted over these imports, so the child_process mock still applies.
const { createStandardAcpRuntime } = await import("../src/providers/acp.shared");
const { cursorAdapter } = await import("../src/providers/cursor/adapter");

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

  it("passes --trust to the cursor CLI when the adapter config sets trust", async () => {
    spawnCalls.length = 0;

    const port = cursorAdapter.createHarness({
      command: "cursor-agent",
      args: [],
      env: {},
      trust: true,
    } as never);

    await port.connect();

    expect(spawnCalls.length).toBeGreaterThan(0);
    expect(spawnCalls[0]?.args).toContain(CURSOR_CLI_ARG.TRUST);
  });

  it("omits --trust when the adapter config does not set trust", async () => {
    spawnCalls.length = 0;

    const port = cursorAdapter.createHarness({
      command: "cursor-agent",
      args: [],
      env: {},
    } as never);

    await port.connect();

    expect(spawnCalls.length).toBeGreaterThan(0);
    expect(spawnCalls[0]?.args).not.toContain(CURSOR_CLI_ARG.TRUST);
  });

  it("carries mode and model from adapter config into the prompt argv", async () => {
    spawnCalls.length = 0;

    const port = cursorAdapter.createHarness({
      command: "cursor-agent",
      args: [],
      env: {},
      mode: "plan",
      model: "claude-sonnet-4.6",
    } as never);

    await expect(
      port.prompt({
        sessionId: "s1",
        prompt: [{ type: "text", text: "hi" }],
      } as never)
    ).rejects.toThrow();

    const promptCall = spawnCalls.at(-1);
    expect(promptCall?.args).toContain(CURSOR_CLI_ARG.MODE);
    expect(promptCall?.args).toContain("plan");
    expect(promptCall?.args).toContain(CURSOR_CLI_ARG.MODEL);
    expect(promptCall?.args).toContain("claude-sonnet-4.6");
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
