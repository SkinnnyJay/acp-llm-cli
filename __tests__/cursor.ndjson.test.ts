import { describe, expect, it } from "vitest";
import { parseCursorNdjsonResult } from "../src/providers/cursor/cursor.ndjson.utils";

const RESULT_LINE = JSON.stringify({
  type: "result",
  subtype: "success",
  result: "Hello from Cursor",
  session_id: "sess-abc",
});

const RESULT_NO_TEXT = JSON.stringify({ type: "result", subtype: "success" });

describe("parseCursorNdjsonResult", () => {
  it("returns result and sessionId from a valid result line", () => {
    const output = parseCursorNdjsonResult(RESULT_LINE);
    expect(output).toEqual({ result: "Hello from Cursor", sessionId: "sess-abc" });
  });

  it("returns result without sessionId when session_id is absent", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", result: "ok" });
    const output = parseCursorNdjsonResult(line);
    expect(output).toEqual({ result: "ok", sessionId: undefined });
  });

  it("returns sessionId without result when result field is absent", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", session_id: "s-1" });
    const output = parseCursorNdjsonResult(line);
    expect(output).toEqual({ result: undefined, sessionId: "s-1" });
  });

  it("returns an object with both fields undefined when result and session_id are absent", () => {
    const output = parseCursorNdjsonResult(RESULT_NO_TEXT);
    expect(output).toEqual({ result: undefined, sessionId: undefined });
  });

  it("returns null for empty string", () => {
    expect(parseCursorNdjsonResult("")).toBeNull();
  });

  it("returns null for output with no matching result line", () => {
    const nonResult = JSON.stringify({ type: "partial_output", text: "thinking..." });
    expect(parseCursorNdjsonResult(nonResult)).toBeNull();
  });

  it("returns null when type is result but subtype is not success", () => {
    const line = JSON.stringify({ type: "result", subtype: "error", result: "fail" });
    expect(parseCursorNdjsonResult(line)).toBeNull();
  });

  it("skips malformed JSON lines and continues searching", () => {
    const output = ["not json at all", '{"broken":', RESULT_LINE].join("\n");
    expect(parseCursorNdjsonResult(output)).toEqual({
      result: "Hello from Cursor",
      sessionId: "sess-abc",
    });
  });

  it("scans from the end — last result line wins", () => {
    const first = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "first",
      session_id: "s-1",
    });
    const last = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "last",
      session_id: "s-2",
    });
    const output = [first, last].join("\n");
    const parsed = parseCursorNdjsonResult(output);
    expect(parsed?.result).toBe("last");
    expect(parsed?.sessionId).toBe("s-2");
  });

  it("handles Windows-style CRLF line endings", () => {
    const output = `${RESULT_LINE}\r\n`;
    expect(parseCursorNdjsonResult(output)).toEqual({
      result: "Hello from Cursor",
      sessionId: "sess-abc",
    });
  });

  it("handles extra unknown fields in the result line (passthrough)", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "hi",
      session_id: "s-3",
      extra_field: "ignored",
    });
    const output = parseCursorNdjsonResult(line);
    expect(output?.result).toBe("hi");
    expect(output?.sessionId).toBe("s-3");
  });

  it("returns null when output has only whitespace lines", () => {
    expect(parseCursorNdjsonResult("   \n  \n  ")).toBeNull();
  });

  it("handles multiple non-result lines before a result line", () => {
    const lines = [
      JSON.stringify({ type: "partial_output", text: "working..." }),
      JSON.stringify({ type: "partial_output", text: "still working..." }),
      RESULT_LINE,
    ].join("\n");
    const output = parseCursorNdjsonResult(lines);
    expect(output?.result).toBe("Hello from Cursor");
  });
});
