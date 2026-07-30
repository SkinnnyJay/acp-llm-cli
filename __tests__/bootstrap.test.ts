import { describe, expect, it } from "vitest";
import { createHarness, getAdapter, getDefaultRegistry } from "../src/bootstrap";
import { PROVIDER_IDS } from "../src/domain/provider.ids";

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
});
