import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_KEY } from "../src/domain/env.keys";

const ROOT = join(import.meta.dirname, "..");

function sampleKeys(): string[] {
  return readFileSync(join(ROOT, ".env.sample"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("=")[0] ?? "")
    .filter(Boolean);
}

/**
 * env.keys.ts states the rule: "All env access must use these constants; no raw strings in code."
 * Three variables bypassed it entirely, one declared key was used nowhere, and .env.sample
 * disagreed with both - three sources of truth for one contract.
 */
describe("environment key contract", () => {
  it("documents every declared key in .env.sample", () => {
    const documented = new Set(sampleKeys());
    const missing = Object.values(ENV_KEY).filter((key) => !documented.has(key));

    expect(missing).toEqual([]);
  });

  it("declares every key that .env.sample documents", () => {
    const declared = new Set<string>(Object.values(ENV_KEY));
    const undeclared = sampleKeys().filter((key) => !declared.has(key));

    expect(undeclared).toEqual([]);
  });
});
