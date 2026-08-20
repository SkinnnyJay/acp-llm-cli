import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { CURSOR_CLI_ARG } from "../src/providers/cursor/constants";
import type { BaseCliConfig } from "../src/runtime/config";
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

/**
 * resolveBaseConfig returns a fresh {command, args, cwd, env} object. Adapters used to hand that
 * reduced object straight to schema.parse, so every provider-specific field a caller set was
 * discarded before it could reach the CLI.
 */
describe("provider config passthrough", () => {
  it("keeps provider-specific fields when the shared ACP runtime resolves config", async () => {
    const { createStandardAcpRuntime } = await import("../src/providers/acp.shared");
    const seen: unknown[] = [];
    const capturingSchema = {
      parse: (value: unknown) => {
        seen.push(value);
        return baseCliConfigSchema.parse(value);
      },
    } as unknown as z.ZodType<BaseCliConfig, z.ZodTypeDef, unknown>;

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
    const { createStandardAcpRuntime } = await import("../src/providers/acp.shared");
    const seen: unknown[] = [];
    const capturingSchema = {
      parse: (value: unknown) => {
        seen.push(value);
        return baseCliConfigSchema.parse(value);
      },
    } as unknown as z.ZodType<BaseCliConfig, z.ZodTypeDef, unknown>;

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
    const { cursorAdapter } = await import("../src/providers/cursor/adapter");

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
    const { cursorAdapter } = await import("../src/providers/cursor/adapter");

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
    const { cursorAdapter } = await import("../src/providers/cursor/adapter");

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
});
