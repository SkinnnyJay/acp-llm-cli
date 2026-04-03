import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_KEY } from "../src/domain/env.keys";
import { resolveBaseConfig } from "../src/runtime/config.resolve";

describe("resolveBaseConfig", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("returns defaults when no env or overrides", () => {
    const result = resolveBaseConfig(
      { command: "cmd", args: ["--x"] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" }
    );
    expect(result.command).toBe("cmd");
    expect(result.args).toEqual(["--x"]);
  });

  it("overrides from config when provided", () => {
    const result = resolveBaseConfig(
      { command: "cmd", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      { command: "custom-cmd", args: ["a", "b"], cwd: "/tmp" }
    );
    expect(result.command).toBe("custom-cmd");
    expect(result.args).toEqual(["a", "b"]);
    expect(result.cwd).toBe("/tmp");
  });

  it("overrides command from env when key set", () => {
    process.env[ENV_KEY.ACP_LLM_CLI_CLAUDE_COMMAND] = "env-cmd";
    const result = resolveBaseConfig(
      { command: "cmd", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      undefined,
      process.env
    );
    expect(result.command).toBe("env-cmd");
  });
});
