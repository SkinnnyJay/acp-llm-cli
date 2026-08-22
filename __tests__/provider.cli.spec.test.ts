import { describe, expect, it } from "vitest";
import { claudeCliSpec } from "../src/providers/claude/cli.definition";
import { codexCliSpec } from "../src/providers/codex/cli.definition";
import { cursorCliSpec } from "../src/providers/cursor/cli.definition";
import { geminiCliSpec } from "../src/providers/gemini/cli.definition";

const SPECS = [
  { id: "claude", spec: claudeCliSpec },
  { id: "codex", spec: codexCliSpec },
  { id: "gemini", spec: geminiCliSpec },
  { id: "cursor", spec: cursorCliSpec },
];

/**
 * genericFlagMap and knownFlags are meant to describe the same CLI surface, and nothing used to
 * cross-check them. Claude's map claimed a `--trust` flag that its own flag table never declared
 * and that only Cursor actually accepts, so buildArgs would hand a caller an argv the binary
 * rejects. This is the one assertion that would have caught it.
 */
describe("provider CLI specs", () => {
  for (const { id, spec } of SPECS) {
    it(`${id}: every mapped flag is a flag the provider declares`, () => {
      const declared = new Set(Object.values(spec.knownFlags));
      const mapped = Object.values(spec.genericFlagMap).filter(
        (flag): flag is string => typeof flag === "string"
      );

      expect(mapped.filter((flag) => !declared.has(flag))).toEqual([]);
    });

    it(`${id}: emits only flags it declares when building args`, () => {
      const declared = new Set(Object.values(spec.knownFlags));
      const argv = spec.buildArgs({
        command: "x",
        args: [],
        env: {},
        model: "m",
        trust: true,
        verbose: true,
        print: true,
      } as never);

      const emitted = argv.filter((token) => token.startsWith("--") || /^-[a-z]$/.test(token));
      expect(emitted.filter((flag) => !declared.has(flag))).toEqual([]);
    });

    it(`${id}: declares only flags, never bare subcommands`, () => {
      // knownFlags is the codomain of ProviderFlagMap, whose stated purpose is to stop a flag
      // the provider never declared from being invented at the map. A non-flag token in that
      // table holes the guard: mapping MODEL to it type-checks and emits a bare positional
      // subcommand into a spawned binary's argv. The mapped-subset-of-declared assertion above
      // cannot see it (it IS declared) and the emitted-token filter below only inspects tokens
      // starting with "-".
      const nonFlags = Object.values(spec.knownFlags).filter((value) => !value.startsWith("-"));
      expect(nonFlags).toEqual([]);
    });
  }

  it("no longer claims a --trust flag for claude", () => {
    expect(Object.values(claudeCliSpec.genericFlagMap)).not.toContain("--trust");
    expect(
      claudeCliSpec.buildArgs({ command: "x", args: [], env: {}, trust: true } as never)
    ).not.toContain("--trust");
  });
});
