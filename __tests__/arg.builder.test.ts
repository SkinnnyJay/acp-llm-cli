import { describe, expect, it } from "vitest";
import { buildGenericArgs } from "../src/cli/arg.builder";
import type { GenericFlagMap } from "../src/cli/generic.options";
import { GENERIC_OPTION_KEY } from "../src/cli/generic.options";

const flagMap: GenericFlagMap = {
  [GENERIC_OPTION_KEY.MODEL]: "--model",
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: "--output-format",
  [GENERIC_OPTION_KEY.INPUT_FORMAT]: "--input-format",
  [GENERIC_OPTION_KEY.STREAM]: "--stream",
  [GENERIC_OPTION_KEY.TRUST]: "--trust",
  [GENERIC_OPTION_KEY.SANDBOX]: "--sandbox",
  [GENERIC_OPTION_KEY.WORKSPACE]: "--workspace",
  [GENERIC_OPTION_KEY.RESUME]: "--resume",
  [GENERIC_OPTION_KEY.SESSION_ID]: "--session-id",
  [GENERIC_OPTION_KEY.VERBOSE]: "--verbose",
  [GENERIC_OPTION_KEY.DEBUG]: "--debug",
  [GENERIC_OPTION_KEY.PRINT]: "--print",
};

describe("buildGenericArgs", () => {
  it("returns only baseArgs when options are empty", () => {
    const result = buildGenericArgs({}, flagMap, ["--base"]);
    expect(result).toEqual(["--base"]);
  });

  it("prepends baseArgs before any flag", () => {
    const result = buildGenericArgs({ model: "gpt-4o" }, flagMap, ["--experimental-acp"]);
    expect(result[0]).toBe("--experimental-acp");
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

  it("emits --input-format with value", () => {
    const result = buildGenericArgs({ inputFormat: "text" }, flagMap);
    expect(result).toEqual(["--input-format", "text"]);
  });

  it("emits --stream flag (no value) when stream is true", () => {
    const result = buildGenericArgs({ stream: true }, flagMap);
    expect(result).toContain("--stream");
    expect(result).toHaveLength(1);
  });

  it("does not emit --stream when stream is false", () => {
    const result = buildGenericArgs({ stream: false }, flagMap);
    expect(result).not.toContain("--stream");
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

  it("emits --resume with value", () => {
    const result = buildGenericArgs({ resume: "session-abc" }, flagMap);
    expect(result).toEqual(["--resume", "session-abc"]);
  });

  it("emits --session-id with value", () => {
    const result = buildGenericArgs({ sessionId: "sid-123" }, flagMap);
    expect(result).toEqual(["--session-id", "sid-123"]);
  });

  it("omits --session-id when sessionId is empty string", () => {
    const result = buildGenericArgs({ sessionId: "" }, flagMap);
    expect(result).not.toContain("--session-id");
  });

  it("emits --verbose when verbose is true", () => {
    const result = buildGenericArgs({ verbose: true }, flagMap);
    expect(result).toContain("--verbose");
  });

  it("emits --debug when debug is true", () => {
    const result = buildGenericArgs({ debug: true }, flagMap);
    expect(result).toContain("--debug");
  });

  it("emits --print when print is true", () => {
    const result = buildGenericArgs({ print: true }, flagMap);
    expect(result).toContain("--print");
  });

  it("skips flags not in flagMap", () => {
    const partialMap: GenericFlagMap = { [GENERIC_OPTION_KEY.MODEL]: "--model" };
    const result = buildGenericArgs({ model: "gpt-4o", verbose: true }, partialMap);
    expect(result).toEqual(["--model", "gpt-4o"]);
    expect(result).not.toContain("--verbose");
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
    const result = buildGenericArgs({ verbose: true }, {}, ["--x", "--y"]);
    expect(result).toEqual(["--x", "--y"]);
  });

  it("skips workspace/resume/sessionId/debug/print when flags are absent from flagMap", () => {
    const result = buildGenericArgs(
      {
        workspace: "/tmp",
        resume: "sess",
        sessionId: "id",
        debug: true,
        print: true,
      },
      {},
      ["--base"]
    );
    expect(result).toEqual(["--base"]);
  });

  it("skips model/output/input/stream/trust/sandbox when flags are absent from flagMap", () => {
    const result = buildGenericArgs(
      {
        model: "m",
        outputFormat: "json",
        inputFormat: "text",
        stream: true,
        trust: true,
        sandbox: "docker",
      },
      {},
      ["--base"]
    );
    expect(result).toEqual(["--base"]);
  });
});
