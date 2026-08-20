import { describe, expect, it, vi } from "vitest";
import type { IAgentPort } from "../src/runtime/agent.port";
import { baseCliConfigSchema } from "../src/runtime/config";
import { ProviderMetricsCollector } from "../src/runtime/metrics";
import { ProviderFactory } from "../src/runtime/provider.factory";
import { HarnessRegistry } from "../src/runtime/registry";

const silentLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeRegistry(id = "test-provider") {
  const registry = new HarnessRegistry();
  const createHarness = vi.fn().mockReturnValue({} as IAgentPort);
  registry.register({ id, name: "Test", configSchema: baseCliConfigSchema, createHarness });
  return { registry, createHarness };
}

describe("ProviderFactory metrics", () => {
  it("records exactly one failure on config parse error (no double-count)", () => {
    const { registry } = makeRegistry();
    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime("test-provider", { command: 123 })).toThrow();

    const metrics = factory.getMetrics?.("test-provider");
    expect(metrics).toBeDefined();
    expect(metrics?.invocations).toBe(1);
    expect(metrics?.lastError).toBeDefined();
    expect(silentLogger.warn).toHaveBeenCalledOnce();
  });

  it("throws and records failure when config is null", () => {
    const { registry } = makeRegistry();
    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime("test-provider", null)).toThrow(/required/i);
    const metrics = factory.getMetrics?.("test-provider");
    expect(metrics?.invocations).toBe(1);
    expect(metrics?.lastError).toBeDefined();
  });

  it("throws and records failure when config is undefined", () => {
    const { registry } = makeRegistry();
    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime("test-provider", undefined)).toThrow(/required/i);
    const metrics = factory.getMetrics?.("test-provider");
    expect(metrics?.invocations).toBe(1);
  });

  it("records failure when createHarness itself throws", () => {
    const id = "throwing-provider";
    const registry = new HarnessRegistry();
    registry.register({
      id,
      name: "Throwing",
      configSchema: baseCliConfigSchema,
      createHarness: vi.fn().mockImplementation(() => {
        throw new Error("spawn error");
      }),
    });
    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime(id, { command: "cmd" })).toThrow("spawn error");
    const metrics = factory.getMetrics?.(id);
    expect(metrics?.lastError).toMatch(/spawn error/);
  });

  it("getMetrics returns undefined when collectMetrics is false", () => {
    const { registry } = makeRegistry();
    const factory = new ProviderFactory({ registry, collectMetrics: false });

    factory.createRuntime("test-provider", { command: "cmd" });
    expect(factory.getMetrics?.("test-provider")).toBeUndefined();
  });

  it("records failure message when createHarness throws a non-Error value", () => {
    const id = "string-throw-provider";
    const registry = new HarnessRegistry();
    registry.register({
      id,
      name: "StringThrow",
      configSchema: baseCliConfigSchema,
      createHarness: vi.fn().mockImplementation(() => {
        throw "raw-string-failure";
      }),
    });
    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime(id, { command: "cmd" })).toThrow();
    expect(factory.getMetrics?.(id)?.lastError).toBe("raw-string-failure");
  });

  it("uses the default logger when none is injected", () => {
    const { registry } = makeRegistry("default-logger-provider");
    const factory = new ProviderFactory({ registry });
    const port = factory.createRuntime("default-logger-provider", { command: "cmd" });
    expect(port).toBeDefined();
  });

  it("uses fallback path/detail when parse failure has empty issues", () => {
    const id = "empty-issues-provider";
    const registry = new HarnessRegistry();
    registry.register({
      id,
      name: "EmptyIssues",
      configSchema: {
        safeParse: () => ({
          success: false as const,
          error: { issues: [], message: "validation failed" },
        }),
      } as unknown as typeof baseCliConfigSchema,
      createHarness: vi.fn(),
    });
    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime(id, { command: "cmd" })).toThrow(/Path: config/);
    expect(() => factory.createRuntime(id, { command: "cmd" })).toThrow(/validation failed/);
  });
});

describe("ProviderMetricsCollector", () => {
  it("recordFailure increments invocations and sets lastError, clears lastInvocationMs", () => {
    const m = new ProviderMetricsCollector();
    m.recordSuccess(100);
    expect(m.lastInvocationMs).toBe(100);

    m.recordFailure("something went wrong");
    expect(m.invocations).toBe(2);
    expect(m.lastError).toBe("something went wrong");
    expect(m.lastInvocationMs).toBeUndefined();
  });

  it("reset clears all state", () => {
    const m = new ProviderMetricsCollector();
    m.recordSuccess(50);
    m.reset();

    expect(m.invocations).toBe(0);
    expect(m.lastError).toBeUndefined();
    expect(m.lastInvocationMs).toBeUndefined();
  });
});
