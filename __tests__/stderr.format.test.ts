import { describe, expect, it } from "vitest";
import { LIMIT } from "../src/domain/limits";
import { formatStderrForError } from "../src/domain/stderr.format";

describe("formatStderrForError", () => {
  it("returns empty string for empty input", () => {
    expect(formatStderrForError("")).toBe("");
  });

  it("redacts secrets and leaves short messages intact when not debug", () => {
    expect(formatStderrForError("boom")).toBe("boom");
    expect(formatStderrForError("failed api_key=sk-secret-value here")).toBe(
      "failed api_key=[REDACTED] here"
    );
  });

  it("truncates long stderr when not debug", () => {
    const long = "x".repeat(LIMIT.STDERR_ERROR_CHARS + 50);
    const out = formatStderrForError(long);
    expect(out.startsWith("…")).toBe(true);
    expect(out.length).toBe(LIMIT.STDERR_ERROR_CHARS + 1);
  });

  it("returns full stderr when debug is true", () => {
    const long = `api_key=sk-secret ${"y".repeat(600)}`;
    expect(formatStderrForError(long, { debug: true })).toBe(long);
  });
});
