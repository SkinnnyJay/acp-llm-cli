import { describe, expect, it, vi } from "vitest";

const { written } = vi.hoisted(() => ({ written: [] as string[] }));

vi.mock("@simpill/env.utils", () => ({
  Env: { getValue: () => undefined },
  EnvManager: {
    // Stands in for dotenvx, which writes both of these while loading .env files.
    getInstance: vi.fn(() => {
      // dotenvx uses console.error; test runners patch that above the stream, so
      // both routes are exercised here.
      process.stderr.write("☠ [MISSING_ENV_FILE] missing file (.env)\n");
      console.error("☠ [MISSING_ENV_FILE] missing file (.env.local)");
      process.stderr.write("something else entirely\n");
      console.error("console noise that must survive");
    }),
  },
}));

const { getEnvString } = await import("../src/runtime/env.reader");
const { ENV_KEY } = await import("../src/domain/env.keys");

describe("env bootstrap noise", () => {
  it("drops only the missing-.env message and restores stderr", () => {
    const original = process.stderr.write;
    const originalError = console.error;
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    console.error = (...args: unknown[]) => {
      written.push(args.join(" "));
    };

    try {
      // The first ambient read triggers the one-time bootstrap.
      getEnvString(ENV_KEY.ACP_LLM_CLI_DEBUG, "fallback");
    } finally {
      process.stderr.write = original;
      console.error = originalError;
    }

    const out = written.join("");
    expect(out).not.toContain("MISSING_ENV_FILE");
    // The filter has to be surgical: anything else dotenvx says still gets out.
    expect(out).toContain("something else entirely");
    expect(out).toContain("console noise that must survive");
    // And the override must not outlive the bootstrap.
    expect(process.stderr.write).toBe(original);
    expect(console.error).toBe(originalError);
  });
});
