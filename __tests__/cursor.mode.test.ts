import { describe, expect, it } from "vitest";
import { CURSOR_MODE } from "../src/providers/cursor/constants";
import { resolveCursorMode } from "../src/providers/cursor/cursor.mode.utils";

describe("resolveCursorMode", () => {
  it("maps auto and full-access aliases to agent", () => {
    expect(resolveCursorMode("auto")).toBe(CURSOR_MODE.AGENT);
    expect(resolveCursorMode("full-access")).toBe(CURSOR_MODE.AGENT);
    expect(resolveCursorMode("FULL_ACCESS")).toBe(CURSOR_MODE.AGENT);
  });

  it("maps read-only alias to ask", () => {
    expect(resolveCursorMode("read-only")).toBe(CURSOR_MODE.ASK);
    expect(resolveCursorMode("read_only")).toBe(CURSOR_MODE.ASK);
  });

  it("accepts canonical mode ids with surrounding whitespace", () => {
    expect(resolveCursorMode("  agent  ")).toBe(CURSOR_MODE.AGENT);
    expect(resolveCursorMode("plan")).toBe(CURSOR_MODE.PLAN);
    expect(resolveCursorMode("ASK")).toBe(CURSOR_MODE.ASK);
  });

  it("returns undefined for unknown mode ids", () => {
    expect(resolveCursorMode("")).toBeUndefined();
    expect(resolveCursorMode("unknown")).toBeUndefined();
  });
});
