import { beforeEach, describe, expect, it, vi } from "vitest";

const { ambient } = vi.hoisted(() => ({ ambient: new Map<string, string>() }));

// @simpill/env.utils caches a snapshot of process.env at first access, so mutating process.env
// mid-test cannot drive the ambient path. Mocking the lookup is the only way to exercise it.
vi.mock("@simpill/env.utils", () => ({
  Env: {
    getValue: (key: string) => ambient.get(key),
  },
}));

const { getEnvBoolean, getEnvString, isDebugEnabled, mergeEnv } = await import(
  "../src/runtime/env.reader"
);
const { ENV_KEY } = await import("../src/domain/env.keys");

const DEBUG = ENV_KEY.ACP_LLM_CLI_DEBUG;

describe("env.reader", () => {
  beforeEach(() => {
    ambient.clear();
  });

  describe("one truthy parser for both lookup paths", () => {
    it("accepts this package's truthy set from the ambient environment", () => {
      // Previously the ambient path used the dependency's parser, which accepts only true/1,
      // so ACP_LLM_CLI_DEBUG=yes was truthy via config.env and falsy from the shell.
      for (const truthy of ["true", "1", "yes", "YES", " true "]) {
        ambient.set(DEBUG, truthy);
        expect(getEnvBoolean(DEBUG, false)).toBe(true);
      }
    });

    it("agrees between an override and the ambient environment", () => {
      for (const value of ["true", "1", "yes", "false", "0", "maybe"]) {
        ambient.set(DEBUG, value);
        const fromAmbient = getEnvBoolean(DEBUG, false);
        ambient.clear();
        const fromOverride = getEnvBoolean(DEBUG, false, { [DEBUG]: value });
        expect(fromOverride, `disagreement for ${JSON.stringify(value)}`).toBe(fromAmbient);
      }
    });
  });

  describe("empty values", () => {
    it("treats an explicitly empty boolean override as authoritative", () => {
      ambient.set(DEBUG, "1");
      // Falling through here would silently enable debug - and stop redacting child stderr in
      // thrown errors - for a caller who explicitly blanked it.
      expect(getEnvBoolean(DEBUG, false, { [DEBUG]: "" })).toBe(false);
      expect(isDebugEnabled({ [DEBUG]: "" })).toBe(false);
      expect(getEnvBoolean(DEBUG, false, {})).toBe(true);
    });

    it("treats an empty string override as absent so the ambient value still applies", () => {
      ambient.set(ENV_KEY.ACP_LLM_CLI_CLAUDE_COMMAND, "ambient-binary");
      expect(
        getEnvString(ENV_KEY.ACP_LLM_CLI_CLAUDE_COMMAND, "fallback", {
          [ENV_KEY.ACP_LLM_CLI_CLAUDE_COMMAND]: "",
        })
      ).toBe("ambient-binary");
    });

    it("falls back to the default when the ambient value is empty", () => {
      ambient.set(ENV_KEY.ACP_LLM_CLI_CLAUDE_COMMAND, "");
      expect(getEnvString(ENV_KEY.ACP_LLM_CLI_CLAUDE_COMMAND, "fallback")).toBe("fallback");
    });
  });

  describe("mergeEnv", () => {
    it("layers overrides over the base environment", () => {
      expect(mergeEnv({ B: "2" }, { A: "1", B: "1" })).toEqual({ A: "1", B: "2" });
    });

    it("returns the base environment when there are no overrides", () => {
      expect(mergeEnv(undefined, { A: "1" })).toEqual({ A: "1" });
    });
  });
});
