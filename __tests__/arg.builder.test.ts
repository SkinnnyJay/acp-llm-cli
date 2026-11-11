import { describe, expect, it } from "vitest";
import { getAdapter, getDefaultRegistry } from "../src/bootstrap";
import { buildGenericArgs } from "../src/cli/arg.builder";
import type { GenericFlagMap } from "../src/cli/generic.options";
import { GENERIC_OPTION_KEY } from "../src/cli/generic.options";
import { PROVIDER_IDS } from "../src/domain/provider.ids";

const flagMap: GenericFlagMap = {
  [GENERIC_OPTION_KEY.MODEL]: "--model",
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: "--output-format",
  [GENERIC_OPTION_KEY.TRUST]: "--trust",
  [GENERIC_OPTION_KEY.SANDBOX]: "--sandbox",
  [GENERIC_OPTION_KEY.WORKSPACE]: "--workspace",
  [GENERIC_OPTION_KEY.DEBUG]: "--debug",
};

describe("buildGenericArgs", () => {
  it("returns only baseArgs when options are empty", () => {
    const result = buildGenericArgs({}, flagMap, ["--base"]);
    expect(result).toEqual(["--base"]);
  });

  it("prepends baseArgs before any flag", () => {
    const result = buildGenericArgs({ model: "gpt-4o" }, flagMap, ["--acp"]);
    expect(result[0]).toBe("--acp");
    expect(result).toContain("--model");
    expect(result).toContain("gpt-4o");
  });

  it("emits --model flag with value when model is set", () => {
    const result = buildGenericArgs({ model: "claude-3.5-sonnet" }, flagMap);
    expect(result).toEqual(["--model", "claude-3.5-sonnet"]);
  });

  it("omits --model when model is empty string", () => {
    const result = buildGenericArgs({ model: "" }, flagMap);
    expect(result).not.toContain("--model");
  });

  it("emits --output-format with value", () => {
    const result = buildGenericArgs({ outputFormat: "stream-json" }, flagMap);
    expect(result).toEqual(["--output-format", "stream-json"]);
  });

  it("emits --trust flag when trust is true", () => {
    const result = buildGenericArgs({ trust: true }, flagMap);
    expect(result).toContain("--trust");
  });

  it("does not emit --trust when trust is false", () => {
    const result = buildGenericArgs({ trust: false }, flagMap);
    expect(result).not.toContain("--trust");
  });

  it("emits --sandbox with value", () => {
    const result = buildGenericArgs({ sandbox: "enabled" }, flagMap);
    expect(result).toEqual(["--sandbox", "enabled"]);
  });

  it("emits --workspace with value", () => {
    const result = buildGenericArgs({ workspace: "/my/project" }, flagMap);
    expect(result).toEqual(["--workspace", "/my/project"]);
  });

  it("omits --workspace when workspace is empty string", () => {
    const result = buildGenericArgs({ workspace: "" }, flagMap);
    expect(result).not.toContain("--workspace");
  });

  it("emits --debug when debug is true", () => {
    const result = buildGenericArgs({ debug: true }, flagMap);
    expect(result).toContain("--debug");
  });

  it("skips flags not in flagMap", () => {
    const partialMap: GenericFlagMap = { [GENERIC_OPTION_KEY.MODEL]: "--model" };
    const result = buildGenericArgs({ model: "gpt-4o", debug: true }, partialMap);
    expect(result).toEqual(["--model", "gpt-4o"]);
    expect(result).not.toContain("--debug");
  });

  it("combines multiple flags in order with baseArgs first", () => {
    const result = buildGenericArgs(
      { model: "claude-3.5-sonnet", outputFormat: "stream-json", trust: true },
      flagMap,
      ["--base"]
    );
    expect(result[0]).toBe("--base");
    expect(result).toContain("--model");
    expect(result).toContain("claude-3.5-sonnet");
    expect(result).toContain("--output-format");
    expect(result).toContain("stream-json");
    expect(result).toContain("--trust");
  });

  it("returns baseArgs unmodified when no flagMap keys match", () => {
    const result = buildGenericArgs({ debug: true }, {}, ["--x", "--y"]);
    expect(result).toEqual(["--x", "--y"]);
  });

  it("skips workspace/debug when flags are absent from flagMap", () => {
    const result = buildGenericArgs(
      {
        workspace: "/tmp",
        debug: true,
      },
      {},
      ["--base"]
    );
    expect(result).toEqual(["--base"]);
  });

  it("skips model/output/trust/sandbox when flags are absent from flagMap", () => {
    const result = buildGenericArgs(
      {
        model: "m",
        outputFormat: "json",
        trust: true,
        sandbox: "enabled",
      },
      {},
      ["--base"]
    );
    expect(result).toEqual(["--base"]);
  });
});

describe("cliSpec.buildArgs through the registry", () => {
  it("accepts generic options on a spec whose config type has been erased", () => {
    const adapter = getAdapter(getDefaultRegistry(), PROVIDER_IDS.GEMINI_CLI_ID);
    const spec = adapter?.cliSpec;
    expect(spec).toBeDefined();

    // Reaching a spec this way erases it to ICliSpec<BaseCliConfig>. The
    // generic options below are the whole point of the builder, so they must
    // survive that erasure - both at the type level and at runtime.
    const argv = spec?.buildArgs({
      command: "gemini",
      args: [],
      model: "gemini-2.5-pro",
      outputFormat: "stream-json",
      debug: true,
    });

    expect(argv).toEqual([
      "--model",
      "gemini-2.5-pro",
      "--output-format",
      "stream-json",
      "--debug",
    ]);
  });

  it("falls back to defaultArgs when args is omitted", () => {
    const adapter = getAdapter(getDefaultRegistry(), PROVIDER_IDS.GEMINI_CLI_ID);
    const spec = adapter?.cliSpec;
    // `args` and `env` carry schema defaults, so a caller holding an unparsed
    // config has neither. Omitting args must fall back rather than fail.
    expect(spec?.buildArgs({ command: "gemini" })).toEqual(spec?.defaultArgs);
  });
});
