import { describe, expect, it, vi } from "vitest";
import type { IAgentPort } from "../src/runtime/agent.port";
import { baseCliConfigSchema } from "../src/runtime/config";
import { ProviderFactory } from "../src/runtime/provider.factory";
import { HarnessRegistry } from "../src/runtime/registry";

const silentLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("ProviderFactory metrics", () => {
  it("records exactly one failure on config parse error (no double-count)", () => {
    const registry = new HarnessRegistry();
    const id = "test-provider";
    registry.register({
      id,
      name: "Test",
      configSchema: baseCliConfigSchema,
      createHarness: vi.fn().mockReturnValue({} as IAgentPort),
    });

    const factory = new ProviderFactory({ registry, logger: silentLogger, collectMetrics: true });

    expect(() => factory.createRuntime(id, { command: 123 })).toThrow();

    const metrics = factory.getMetrics?.(id);
    expect(metrics).toBeDefined();
    expect(metrics?.invocations).toBe(1);
    expect(metrics?.lastError).toBeDefined();
    expect(silentLogger.error).toHaveBeenCalledOnce();
  });
});
