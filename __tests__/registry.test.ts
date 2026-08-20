import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import type { IAgentPort } from "../src/runtime/agent.port";
import type { BaseCliConfig } from "../src/runtime/config";
import { baseCliConfigSchema } from "../src/runtime/config";
import { createCliHarnessAdapter } from "../src/runtime/create.cli.harness.adapter";
import { HarnessRegistry } from "../src/runtime/registry";

describe("HarnessRegistry", () => {
  it("starts empty", () => {
    const registry = new HarnessRegistry();
    expect(registry.has(PROVIDER_IDS.CLAUDE_CLI_ID)).toBe(false);
    expect(registry.get(PROVIDER_IDS.CLAUDE_CLI_ID)).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });

  it("register and get", () => {
    const registry = new HarnessRegistry();
    const adapter = createCliHarnessAdapter<BaseCliConfig>({
      id: PROVIDER_IDS.CLAUDE_CLI_ID,
      name: PROVIDER_IDS.CLAUDE_CLI_NAME,
      configSchema: baseCliConfigSchema,
      createRuntime: () => ({}) as IAgentPort,
    });
    registry.register(adapter);
    expect(registry.has(PROVIDER_IDS.CLAUDE_CLI_ID)).toBe(true);
    expect(registry.get(PROVIDER_IDS.CLAUDE_CLI_ID)).toBe(adapter);
    expect(registry.list()).toHaveLength(1);
  });

  it("createCliHarnessAdapter exposes id, name, and optional cliSpec getters", () => {
    const cliSpec = {
      defaultArgs: ["--x"],
      genericFlagMap: {},
      knownFlags: {},
      buildArgs: () => ["--x"],
      getHelp: async () => "help",
    };
    const adapter = createCliHarnessAdapter<BaseCliConfig>({
      id: "test-id",
      name: "Test Name",
      configSchema: baseCliConfigSchema,
      createRuntime: () => ({}) as IAgentPort,
      cliSpec,
    });
    expect(adapter.id).toBe("test-id");
    expect(adapter.name).toBe("Test Name");
    expect(adapter.cliSpec).toBe(cliSpec);
    expect(adapter.createHarness({ command: "cmd", args: [], env: {} })).toBeDefined();
  });
});
