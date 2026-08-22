/**
 * Targeted branch-coverage tests for modules whose branches weren't exercised
 * by functional tests. Each suite is minimal — it covers uncovered branches only.
 */
import { describe, expect, it, vi } from "vitest";
import { createStandardCliSpec } from "../src/cli/standard.cli.factory";
import { ENV_KEY } from "../src/domain/env.keys";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { getEnvBoolean, getEnvString, mergeEnv } from "../src/runtime/env.reader";
import { createStreamPromptQueue } from "../src/runtime/stream.prompt.queue";

// ---------------------------------------------------------------------------
// env.reader.ts — branches for override presence/absence and boolean truthy
// ---------------------------------------------------------------------------
describe("getEnvString", () => {
  it("returns override value when override key is present and non-empty", () => {
    const result = getEnvString(ENV_KEY.ACP_LLM_CLI_DEBUG, "default", {
      [ENV_KEY.ACP_LLM_CLI_DEBUG]: "custom",
    });
    expect(result).toBe("custom");
  });

  it("falls through to default when override key is present but empty string", () => {
    const result = getEnvString(ENV_KEY.ACP_LLM_CLI_DEBUG, "default", {
      [ENV_KEY.ACP_LLM_CLI_DEBUG]: "",
    });
    expect(result).toBe("default");
  });

  it("falls through to default when override is undefined", () => {
    const result = getEnvString(ENV_KEY.ACP_LLM_CLI_DEBUG, "fallback", undefined);
    expect(result).toBe("fallback");
  });

  it("falls through to default when override does not contain the key", () => {
    const result = getEnvString(ENV_KEY.ACP_LLM_CLI_DEBUG, "fallback", {});
    expect(result).toBe("fallback");
  });
});

describe("getEnvBoolean", () => {
  it("returns true for truthy override string values", () => {
    for (const truthy of ["true", "1", "yes"]) {
      expect(
        getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, false, { [ENV_KEY.ACP_LLM_CLI_DEBUG]: truthy })
      ).toBe(true);
    }
  });

  it("returns false for non-truthy override string values", () => {
    expect(
      getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, true, { [ENV_KEY.ACP_LLM_CLI_DEBUG]: "false" })
    ).toBe(false);
  });

  it("returns default when override key is present but value is undefined", () => {
    const override: NodeJS.ProcessEnv = {};
    Object.defineProperty(override, ENV_KEY.ACP_LLM_CLI_DEBUG, {
      value: undefined,
      enumerable: true,
    });
    const result = getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, true, override);
    expect(result).toBe(true);
  });

  it("returns default when no override is provided", () => {
    expect(getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, false, undefined)).toBe(false);
  });
});

describe("mergeEnv", () => {
  it("returns merged env with overrides taking precedence", () => {
    const result = mergeEnv({ MY_KEY: "override" }, { MY_KEY: "base", OTHER: "keep" });
    expect(result.MY_KEY).toBe("override");
    expect(result.OTHER).toBe("keep");
  });

  it("uses empty object when overrides is undefined", () => {
    const result = mergeEnv(undefined, { FOO: "bar" });
    expect(result.FOO).toBe("bar");
  });
});

// ---------------------------------------------------------------------------
// stream.prompt.queue.ts — pushError branch, close-then-push idempotency
// ---------------------------------------------------------------------------
describe("createStreamPromptQueue — branch coverage", () => {
  it("pushError causes consume() to reject", async () => {
    const queue = createStreamPromptQueue();
    const err = new Error("stream error");

    setTimeout(() => queue.pushError(err), 0);

    await expect(async () => {
      for await (const _ of queue.consume()) {
        // consume
      }
    }).rejects.toThrow("stream error");
  });

  it("pushError after done is a no-op", async () => {
    const queue = createStreamPromptQueue();
    queue.close();
    queue.pushError(new Error("late error")); // should be ignored
    const items: unknown[] = [];
    for await (const item of queue.consume()) {
      items.push(item);
    }
    expect(items).toHaveLength(0);
  });

  it("push after close is a no-op", async () => {
    const queue = createStreamPromptQueue();
    queue.close();
    queue.push({ sessionId: "s1", update: {} } as Parameters<typeof queue.push>[0]);
    const items: unknown[] = [];
    for await (const item of queue.consume()) {
      items.push(item);
    }
    expect(items).toHaveLength(0);
  });

  it("close is idempotent — calling twice does not throw", () => {
    const queue = createStreamPromptQueue();
    expect(() => {
      queue.close();
      queue.close();
    }).not.toThrow();
  });

  it("terminates immediately when close was called before the consumer started", async () => {
    // close() sets done before the consumer calls nextPromise() — iterator ends immediately.
    const queue = createStreamPromptQueue();
    queue.close();

    const items: unknown[] = [];
    for await (const item of queue.consume()) {
      items.push(item);
    }
    expect(items).toHaveLength(0);
  });

  it("resolves wake with error when pushError is called while consumer is waiting", async () => {
    const queue = createStreamPromptQueue();
    const err = new Error("async error");

    const consumePromise = (async () => {
      const items: unknown[] = [];
      try {
        for await (const item of queue.consume()) {
          items.push(item);
        }
      } catch (e) {
        return e;
      }
      return items;
    })();

    await new Promise((r) => setTimeout(r, 0));
    queue.pushError(err);

    const result = await consumePromise;
    expect(result).toBe(err);
  });
});

// ---------------------------------------------------------------------------
// standard.cli.factory.ts — buildArgs with/without config.args
// ---------------------------------------------------------------------------
describe("createStandardCliSpec.buildArgs", () => {
  const flagMap = {};
  const knownFlags = {};

  it("uses config.args when provided, not defaultArgs", () => {
    const spec = createStandardCliSpec(["--default"], flagMap, knownFlags);
    const result = spec.buildArgs({
      command: "cmd",
      args: ["--custom"],
      env: {},
    });
    expect(result).toContain("--custom");
    expect(result).not.toContain("--default");
  });

  it("uses defaultArgs when config.args is absent", () => {
    const spec = createStandardCliSpec(["--default"], flagMap, knownFlags);
    const result = spec.buildArgs({ command: "cmd", env: {} });
    expect(result).toContain("--default");
  });

  it("exposes defaultArgs, genericFlagMap, and knownFlags", () => {
    const spec = createStandardCliSpec(["--experimental"], { model: "--model" }, { verbose: "-v" });
    expect(spec.defaultArgs).toEqual(["--experimental"]);
    expect(spec.genericFlagMap).toEqual({ model: "--model" });
    expect(spec.knownFlags).toEqual({ verbose: "-v" });
  });

  it("getHelp delegates to extractHelp with command and args", async () => {
    const helpModule = await import("../src/cli/help.extractor");
    const spy = vi.spyOn(helpModule, "extractHelp").mockResolvedValue("help text");

    const spec = createStandardCliSpec(["--default"], flagMap, knownFlags);
    const result = await spec.getHelp({
      command: "my-cli",
      args: ["--custom"],
      cwd: "/tmp",
      env: { FOO: "1" },
    });

    expect(result).toBe("help text");
    expect(spy).toHaveBeenCalledWith({
      command: "my-cli",
      args: ["--custom"],
      cwd: "/tmp",
      env: { FOO: "1" },
    });
    spy.mockRestore();
  });

  it("getHelp falls back to defaultArgs when options.args is omitted", async () => {
    const helpModule = await import("../src/cli/help.extractor");
    const spy = vi.spyOn(helpModule, "extractHelp").mockResolvedValue("default help");

    const spec = createStandardCliSpec(["--default"], flagMap, knownFlags);
    await spec.getHelp({ command: "my-cli" });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "my-cli",
        args: ["--default"],
      })
    );
    spy.mockRestore();
  });
});

describe("ERROR_MESSAGE helpers", () => {
  it("formats HELP and AGENT_PROCESS_EXITED messages", () => {
    expect(ERROR_MESSAGE.HELP_EXTRACTION_TIMEOUT(1000)).toMatch(/1000/);
    expect(ERROR_MESSAGE.HELP_COMMAND_FAILED(2, "", "boom")).toMatch(/2/);
    expect(ERROR_MESSAGE.HELP_COMMAND_FAILED(2, "", "boom")).toMatch(/boom/);
    expect(ERROR_MESSAGE.HELP_COMMAND_FAILED("unknown", " (signal SIGKILL)", "")).toMatch(
      /SIGKILL/
    );
    expect(ERROR_MESSAGE.AGENT_PROCESS_EXITED(1, " (signal SIGTERM)", "\nstderr")).toMatch(
      /SIGTERM/
    );
  });
});
