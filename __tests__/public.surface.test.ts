import { describe, expect, it } from "vitest";
import * as root from "../src/index";
import * as runtime from "../src/runtime/index";

/**
 * The two entry points deliberately share a vocabulary. Nothing used to check that they agree,
 * and the one place they disagreed was a defect: HarnessRegistry was a value on ./runtime but
 * type-only on ".", so the custom-registry workflow both docs advertise was impossible from the
 * root entry point.
 */
describe("public surface", () => {
  it("exposes HarnessRegistry as a constructible value from the root entry point", () => {
    expect(typeof root.HarnessRegistry).toBe("function");
    const registry = new root.HarnessRegistry();
    expect(registry.list()).toEqual([]);
  });

  it("gives shared symbols one identity across both entry points", () => {
    const shared = Object.keys(root).filter((name) => name in runtime);
    expect(shared.length).toBeGreaterThan(0);

    for (const name of shared) {
      expect(
        (root as Record<string, unknown>)[name],
        `${name} differs between "." and "./runtime"`
      ).toBe((runtime as Record<string, unknown>)[name]);
    }
  });

  it("keeps the documented shared core a constructible value on both entry points", () => {
    // The previous version of this case built `shared` by filtering on `name in runtime` and
    // then asserted those same names were in runtime - true by construction, so it could never
    // fail. The two barrels are overlapping sets, not nested (root exports 44 values, runtime
    // 20, sharing these 10), so "root is a subset of runtime" is not the invariant either.
    // What actually matters is the defect the docblock above names: a symbol vanishing from one
    // barrel, or becoming type-only there. Pin the shared core explicitly so either fails.
    const SHARED_CORE = [
      "HarnessRegistry",
      "ProviderClient",
      "ProviderClientFactory",
      "ProviderFactory",
      "ProviderMetricsCollector",
      "baseCliConfigSchema",
      "createAcpAgentPort",
      "createAcpCliHarnessRuntime",
      "createMemorySessionPersistence",
      "createStandardAcpRuntime",
    ] as const;

    for (const name of SHARED_CORE) {
      expect((root as Record<string, unknown>)[name], `${name} missing from "."`).toBeDefined();
      expect(
        (runtime as Record<string, unknown>)[name],
        `${name} missing from "./runtime"`
      ).toBeDefined();
    }
  });
});
