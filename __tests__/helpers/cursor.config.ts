import type { CursorConfig } from "../../src/providers/cursor/schema";

/**
 * A valid CursorConfig for tests.
 *
 * `CursorConfig` is the type *after* Zod has parsed it, so `args` and `env` are
 * required even though their schemas supply defaults. Production code always
 * holds a parsed config, so the port is right to demand one - but a test
 * writing `{ command: "cursor-agent" }` by hand is not wrong about intent, only
 * about the defaults. This fills them in so tests state the fields they care
 * about and nothing else.
 */
export function createCursorConfig(overrides: Partial<CursorConfig> = {}): CursorConfig {
  return {
    command: "cursor-agent",
    args: [],
    env: {},
    ...overrides,
  } as CursorConfig;
}
