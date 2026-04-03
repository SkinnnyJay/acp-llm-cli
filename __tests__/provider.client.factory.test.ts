import { describe, expect, it } from "vitest";
import { PROVIDER_VALUES, Provider, getDefaultProviderClientFactory } from "../src/index";

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
});
