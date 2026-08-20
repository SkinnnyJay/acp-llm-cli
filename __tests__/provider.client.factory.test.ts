import { describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getDefaultProviderClientFactory, PROVIDER_VALUES, Provider } from "../src/index";

describe("ProviderClientFactory", () => {
  it("getDefaultProviderClientFactory returns factory with getClient and listProviders", () => {
    const factory = getDefaultProviderClientFactory();
    expect(factory.listProviders()).toContain(Provider.CLAUDE);
    expect(factory.listProviders()).toEqual(PROVIDER_VALUES);
    expect(factory.listProviders().length).toBe(4);
    expect(typeof factory.getClient).toBe("function");
  });

  it("getClient(Provider.CLAUDE, config) returns IProviderClient with provider and port", () => {
    const factory = getDefaultProviderClientFactory();
    const client = factory.getClient(Provider.CLAUDE, {
      command: "claude-code-acp",
      args: [],
    });
    expect(client.provider).toBe(Provider.CLAUDE);
    expect(client.port).toBeDefined();
    expect(typeof client.port.connect).toBe("function");
    expect(typeof client.port.prompt).toBe("function");
  });

  it("getClient(Provider.GEMINI, config) returns client with gemini port", () => {
    const factory = getDefaultProviderClientFactory();
    const client = factory.getClient(Provider.GEMINI, {
      command: "gemini",
      args: ["--experimental-acp"],
    });
    expect(client.provider).toBe(Provider.GEMINI);
    expect(client.port).toBeDefined();
  });

  it("getClient throws for invalid config with validation message", () => {
    const factory = getDefaultProviderClientFactory();
    expect(() => factory.getClient(Provider.CODEX, { command: 123 })).toThrow(
      /Config validation failed|Validation error|invalid_type/
    );
  });

  it("getClient throws for a value outside the Provider enum", () => {
    const factory = getDefaultProviderClientFactory();
    expect(() =>
      factory.getClient("not-a-provider" as (typeof PROVIDER_VALUES)[number], {
        command: "cmd",
        args: [],
      })
    ).toThrow(/Unknown provider id/);
  });

  it("lists only providers the injected factory actually has registered", async () => {
    const { HarnessRegistry } = await import("../src/runtime/registry");
    const { ProviderFactory } = await import("../src/runtime/provider.factory");
    const { ProviderClientFactory } = await import("../src/runtime/provider.client.factory");
    const { claudeAdapter } = await import("../src/providers/claude/adapter");

    const registry = new HarnessRegistry();
    registry.register(claudeAdapter);
    const factory = new ProviderClientFactory(new ProviderFactory({ registry }));

    expect(factory.listProviders()).toEqual([Provider.CLAUDE]);
  });
});
