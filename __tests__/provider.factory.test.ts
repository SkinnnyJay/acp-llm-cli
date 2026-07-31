import { describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { PROVIDER_IDS, getDefaultFactory } from "../src/index";

describe("ProviderFactory", () => {
  it("getDefaultFactory returns factory with createRuntime and listProviderIds", () => {
    const factory = getDefaultFactory();
    expect(factory.listProviderIds()).toContain(PROVIDER_IDS.CLAUDE_CLI_ID);
    expect(factory.listProviderIds().length).toBe(4);
    expect(typeof factory.createRuntime).toBe("function");
    expect(typeof factory.getProvider).toBe("function");
  });

  it("createRuntime returns IAgentPort for valid id and config", () => {
    const factory = getDefaultFactory();
    const port = factory.createRuntime(PROVIDER_IDS.CLAUDE_CLI_ID, {
      command: "claude-code-acp",
      args: [],
    });
    expect(port).toBeDefined();
    expect(typeof port.connect).toBe("function");
    expect(typeof port.prompt).toBe("function");
  });

  it("createRuntime throws for unknown id with clear message", () => {
    const factory = getDefaultFactory();
    expect(() => factory.createRuntime("unknown-id", {})).toThrow(/Unknown provider id/);
  });

  it("createRuntime throws for invalid config with validation message", () => {
    const factory = getDefaultFactory();
    expect(() => factory.createRuntime(PROVIDER_IDS.CLAUDE_CLI_ID, { command: 123 })).toThrow(
      /Config validation failed|Validation error|invalid_type/
    );
  });

  it("getProvider returns adapter for registered id", () => {
    const factory = getDefaultFactory();
    const provider = factory.getProvider(PROVIDER_IDS.GEMINI_CLI_ID);
    expect(provider).toBeDefined();
    expect(provider?.id).toBe(PROVIDER_IDS.GEMINI_CLI_ID);
    expect(provider?.cliSpec?.defaultArgs).toEqual(["--experimental-acp"]);
  });

  it("getMetrics returns metrics after createRuntime when collectMetrics true", () => {
    const factory = getDefaultFactory({ collectMetrics: true });
    factory.createRuntime(PROVIDER_IDS.CODEX_CLI_ID, {
      command: "codex",
      args: ["--experimental-acp"],
    });
    const metrics = factory.getMetrics?.(PROVIDER_IDS.CODEX_CLI_ID);
    expect(metrics).toBeDefined();
    expect(metrics?.invocations).toBeGreaterThanOrEqual(1);
    expect(metrics?.lastError).toBeUndefined();
    expect(typeof metrics?.lastInvocationMs).toBe("number");
  });
});
