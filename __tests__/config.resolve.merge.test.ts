import { describe, expect, it } from "vitest";
import { resolveBaseConfig } from "../src/runtime/config.resolve";

describe("resolveBaseConfig owns the precedence rule", () => {
  it("preserves provider-specific fields instead of reducing to the base four", () => {
    // The return type was BaseCliConfig, so callers had to write
    // `schema.parse({ ...config, ...resolved })` to stop provider fields being discarded -
    // duplicated at two sites, each with its own explanatory comment. Precedence was expressed
    // by spread ARGUMENT ORDER, so `{ ...resolved, ...config }` type-checked identically and
    // silently threw away all env/default resolution.
    const out = resolveBaseConfig(
      { command: "default-cmd", args: ["--default"] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      { command: "explicit-cmd", args: ["--explicit"], model: "m", verbose: true } as never,
      {}
    );

    expect(out).toMatchObject({
      command: "explicit-cmd",
      args: ["--explicit"],
      model: "m",
      verbose: true,
    });
  });

  it("prefers the caller's command over the env var, and the env var over the default", () => {
    // The previous version of this case passed a config with no command and no args, so it
    // asserted the plain default path rather than precedence - it would have passed against the
    // inverted `{ ...resolved, ...config }` too. Drive all three layers instead.
    const env = { ACP_LLM_CLI_CLAUDE_COMMAND: "from-env" };

    const callerWins = resolveBaseConfig(
      { command: "from-default", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      { command: "from-caller" },
      env
    );
    expect(callerWins.command).toBe("from-caller");

    // Carries env so it satisfies Partial<BaseCliConfig>; a real provider config always does.
    const modelOnly = { model: "m", env: {} };
    const envWins = resolveBaseConfig(
      { command: "from-default", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      modelOnly,
      env
    );
    expect(envWins.command).toBe("from-env");

    const defaultWins = resolveBaseConfig(
      { command: "from-default", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      modelOnly,
      {}
    );
    expect(defaultWins.command).toBe("from-default");
  });

  it("preserves an explicit cwd", () => {
    const out = resolveBaseConfig(
      { command: "c", args: [] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      { cwd: "/work" },
      {}
    );
    expect(out.cwd).toBe("/work");
  });
});
