import { describe, expect, it } from "vitest";
import { getDefaultRegistry } from "../src/bootstrap";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands";
import { ENV_KEY } from "../src/domain/env.keys";
import { PORT_CAPABILITY } from "../src/domain/port.capabilities";
import { PROVIDER_VALUES, Provider, ProviderSchema } from "../src/domain/provider";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import { antigravityAdapter } from "../src/providers/antigravity/adapter";
import { ANTIGRAVITY_CONFIG_KEYS } from "../src/providers/antigravity/constants";
import { claudeAdapter } from "../src/providers/claude/adapter";
import { resolveBaseConfig } from "../src/runtime/config.resolve";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";

describe("antigravity adapter over ACP", () => {
  it("defaults to `agy acp`", () => {
    expect(DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_COMMAND).toBe("agy");
    expect([...DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_ARGS]).toEqual(["acp"]);
  });

  it("has the antigravity-cli id", () => {
    expect(antigravityAdapter.id).toBe("antigravity-cli");
    expect(antigravityAdapter.id).toBe(PROVIDER_IDS.ANTIGRAVITY_CLI_ID);
    expect(PROVIDER_IDS.ANTIGRAVITY_CLI_NAME).toBe("Antigravity CLI");
  });

  it("builds the same kind of port as the other ACP providers", () => {
    const agy = antigravityAdapter.createHarness({ command: "agy", args: ["acp"], env: {} });
    const claude = claudeAdapter.createHarness({ command: "claude-agent-acp", args: [], env: {} });
    expect(agy.constructor).toBe(claude.constructor);
    expect(agy.capabilities?.[PORT_CAPABILITY.RESTART]).toBe(true);
    expect(agy.capabilities?.[PORT_CAPABILITY.STREAM_PROMPT]).toBe(true);
    expect(typeof agy.streamPrompt).toBe("function");
  });

  it("honours session persistence instead of ignoring it", () => {
    const port = antigravityAdapter.createHarness(
      { command: "agy", args: ["acp"], env: {} },
      { sessionPersistence: createMemorySessionPersistence() }
    );
    expect(port.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(true);
  });

  it("applies the env override keys for command and args", () => {
    expect(ANTIGRAVITY_CONFIG_KEYS.COMMAND_KEY).toBe("ACP_LLM_CLI_ANTIGRAVITY_COMMAND");
    expect(ANTIGRAVITY_CONFIG_KEYS.ARGS_KEY).toBe("ACP_LLM_CLI_ANTIGRAVITY_ARGS");
    const result = resolveBaseConfig(
      {
        command: DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_COMMAND,
        args: [...DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_ARGS],
      },
      {
        commandKey: ANTIGRAVITY_CONFIG_KEYS.COMMAND_KEY,
        argsKey: ANTIGRAVITY_CONFIG_KEYS.ARGS_KEY,
      },
      undefined,
      {
        [ENV_KEY.ACP_LLM_CLI_ANTIGRAVITY_COMMAND]: "/opt/agy",
        [ENV_KEY.ACP_LLM_CLI_ANTIGRAVITY_ARGS]: "acp --login",
      }
    );
    expect(result.command).toBe("/opt/agy");
    expect(result.args).toEqual(["acp", "--login"]);
  });
});

describe("provider set", () => {
  it("contains antigravity-cli and not gemini-cli", () => {
    expect(Provider.ANTIGRAVITY).toBe("antigravity-cli");
    expect(PROVIDER_VALUES).toContain("antigravity-cli");
    expect(PROVIDER_VALUES).not.toContain("gemini-cli");
    expect(ProviderSchema.options).toContain("antigravity-cli");
    expect(ProviderSchema.options).not.toContain("gemini-cli");
    expect(Object.values(Provider)).not.toContain("gemini-cli");
  });

  it("registers exactly claude, codex, cursor and antigravity by default", () => {
    const ids = getDefaultRegistry()
      .list()
      .map((adapter) => adapter.id)
      .sort();
    expect(ids).toEqual(["antigravity-cli", "claude-cli", "codex-cli", "cursor-cli"]);
  });
});
