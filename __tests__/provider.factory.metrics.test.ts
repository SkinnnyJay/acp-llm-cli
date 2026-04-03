import { describe, expect, it, vi } from "vitest";
import { ProviderFactory } from "../src/runtime/provider.factory";
import { baseCliConfigSchema } from "../src/runtime/config";
import type { BaseCliConfig } from "../src/runtime/config";
import type { IAgentPort } from "../src/runtime/agent.port";
import { HarnessRegistry } from "../src/runtime/registry";

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

    const factory = new ProviderFactory({ registry, collectMetrics: true });

    expect(() => factory.createRuntime(id, { command: 123 })).toThrow();

    const metrics = factory.getMetrics?.(id);
    expect(metrics).toBeDefined();
    expect(metrics?.invocations).toBe(1);
    expect(metrics?.lastError).toBeDefined();
  });
});
