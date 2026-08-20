import { describe, expect, it, vi } from "vitest";

const { written } = vi.hoisted(() => ({ written: [] as string[] }));

vi.mock("@simpill/env.utils", () => ({
  Env: { getValue: () => undefined },
  EnvManager: {
    // Stands in for dotenvx, which writes both of these while loading .env files.
    getInstance: vi.fn(() => {
      process.stderr.write("☠ [MISSING_ENV_FILE] missing file (.env)\n");
      process.stderr.write("something else entirely\n");
    }),
  },
}));

const { getEnvString } = await import("../src/runtime/env.reader");
const { ENV_KEY } = await import("../src/domain/env.keys");

describe("env bootstrap noise", () => {
  it("drops only the missing-.env message and restores stderr", () => {
    const original = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      // The first ambient read triggers the one-time bootstrap.
      getEnvString(ENV_KEY.ACP_LLM_CLI_DEBUG, "fallback");
    } finally {
      process.stderr.write = original;
    }

    const out = written.join("");
    expect(out).not.toContain("MISSING_ENV_FILE");
    // The filter has to be surgical: anything else dotenvx says still gets out.
    expect(out).toContain("something else entirely");
    // And the override must not outlive the bootstrap.
    expect(process.stderr.write).toBe(original);
  });
});
