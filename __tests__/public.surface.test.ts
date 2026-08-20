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

  it("keeps the shared vocabulary a subset of the runtime surface", () => {
    const shared = Object.keys(root).filter((name) => name in runtime);
    expect(shared.every((name) => Object.keys(runtime).includes(name))).toBe(true);
  });
});
