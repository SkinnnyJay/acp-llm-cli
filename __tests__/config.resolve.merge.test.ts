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

  it("still lets the resolved base win over the caller's own base fields", () => {
    const out = resolveBaseConfig(
      { command: "default-cmd", args: ["--default"] },
      { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
      { model: "m" } as never,
      {}
    );
    expect(out).toMatchObject({ command: "default-cmd", args: ["--default"], model: "m" });
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
