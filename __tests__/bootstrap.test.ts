import { describe, expect, it } from "vitest";
import { createHarness, getAdapter, getDefaultRegistry } from "../src/bootstrap";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import { createAcpCliHarnessRuntime } from "../src/providers/acp.shared";
import { baseCliConfigSchema } from "../src/runtime/config";
import { createCliHarnessAdapter } from "../src/runtime/create.cli.harness.adapter";
import { HarnessRegistry } from "../src/runtime/registry";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";
import { createMockAgentPort } from "./helpers/mock.agent.port";

describe("bootstrap", () => {
  it("getDefaultRegistry returns registry with adapters", () => {
    const registry = getDefaultRegistry();
    expect(registry.has(PROVIDER_IDS.CLAUDE_CLI_ID)).toBe(true);
    expect(registry.has(PROVIDER_IDS.GEMINI_CLI_ID)).toBe(true);
    expect(registry.has(PROVIDER_IDS.CODEX_CLI_ID)).toBe(true);
    expect(registry.has(PROVIDER_IDS.CURSOR_CLI_ID)).toBe(true);
    expect(registry.list().length).toBe(4);
  });

  it("getAdapter returns the registered adapter for a known id", () => {
    const registry = getDefaultRegistry();
    const adapter = getAdapter(registry, PROVIDER_IDS.CLAUDE_CLI_ID);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe(PROVIDER_IDS.CLAUDE_CLI_ID);
  });

  it("getAdapter returns undefined for an unknown id", () => {
    const registry = getDefaultRegistry();
    expect(getAdapter(registry, "no-such-provider")).toBeUndefined();
  });

  it("createHarness returns IAgentPort for valid id", () => {
    const registry = getDefaultRegistry();
    const port = createHarness(registry, PROVIDER_IDS.CLAUDE_CLI_ID, {
      command: "claude-code-acp",
      args: [],
    });
    expect(port).toBeDefined();
    expect(typeof port.connect).toBe("function");
    expect(typeof port.disconnect).toBe("function");
    expect(typeof port.prompt).toBe("function");
  });

  it("createHarness throws for unknown id", () => {
    const registry = getDefaultRegistry();
    expect(() => createHarness(registry, "unknown-id", {})).toThrow(/Unknown provider id/);
  });

  it("defaults providerId so a custom registry can use session persistence", () => {
    const registry = new HarnessRegistry();
    registry.register(
      createCliHarnessAdapter({
        id: "custom-provider",
        name: "Custom",
        configSchema: baseCliConfigSchema,
        // Deliberately does NOT self-default providerId, unlike the bundled adapters.
        createRuntime: (config, runtimeOptions) =>
          createAcpCliHarnessRuntime(config, runtimeOptions, {
            create: () => createFakeAcpConnection() as never,
          }),
      })
    );

    expect(() =>
      createHarness(
        registry,
        "custom-provider",
        { command: "cmd", args: [] },
        { sessionPersistence: createMemorySessionPersistence() }
      )
    ).not.toThrow();
  });

  it("lets an explicit providerId win over the registry id", () => {
    const seen: Array<string | undefined> = [];
    const registry = new HarnessRegistry();
    registry.register(
      createCliHarnessAdapter({
        id: "custom-provider",
        name: "Custom",
        configSchema: baseCliConfigSchema,
        createRuntime: (_config, runtimeOptions) => {
          seen.push(runtimeOptions?.providerId);
          return createMockAgentPort();
        },
      })
    );

    createHarness(registry, "custom-provider", { command: "cmd", args: [] });
    createHarness(
      registry,
      "custom-provider",
      { command: "cmd", args: [] },
      { providerId: "mine" }
    );

    expect(seen).toEqual(["custom-provider", "mine"]);
  });
});
