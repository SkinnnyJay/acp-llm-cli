import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}

/**
 * src/README.md declares the dependency direction: runtime/ may import domain/, and providers/
 * import domain/ and runtime/. The reverse used to hold in six places - including a value
 * re-export in the published ./runtime entry point - so the documented rule was false.
 */
describe("module layering", () => {
  it("never imports the providers layer from the runtime layer", () => {
    const offenders = walk(join(SRC, "runtime"))
      .filter((file) => /from\s+"[^"]*providers\//.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  it("never imports the runtime or providers layers from the domain layer", () => {
    const offenders = walk(join(SRC, "domain"))
      .filter((file) => /from\s+"[^"]*(runtime|providers)\//.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });
});
