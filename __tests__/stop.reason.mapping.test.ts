import { describe, expect, it } from "vitest";
import { OPENAI_FINISH_REASON } from "../src/domain/openai.compat";
import { STOP_REASON_TO_FINISH_REASON, toFinishReason } from "../src/domain/stop.reason";

describe("toFinishReason", () => {
  it("maps every protocol stop reason", () => {
    expect(toFinishReason("end_turn")).toBe(OPENAI_FINISH_REASON.STOP);
    expect(toFinishReason("max_tokens")).toBe(OPENAI_FINISH_REASON.LENGTH);
    expect(toFinishReason("max_turn_requests")).toBe(OPENAI_FINISH_REASON.LENGTH);
    expect(toFinishReason("refusal")).toBe(OPENAI_FINISH_REASON.CONTENT_FILTER);
    expect(toFinishReason("cancelled")).toBe(OPENAI_FINISH_REASON.STOP);
  });

  it("falls back for an absent stop reason", () => {
    expect(toFinishReason(undefined)).toBe(OPENAI_FINISH_REASON.STOP);
  });

  // stopReason arrives from a third-party agent binary over JSON-RPC. The SDK's prompt() passes
  // no mapResponse, so the value is unvalidated. Indexing a plain object literal with it reaches
  // Object.prototype: "constructor" and "toString" return Functions, which are truthy - so a
  // downstream `?? default` never fires - and JSON.stringify drops function-valued properties,
  // shipping a terminal chunk with NO finish_reason key at all. An OpenAI client reads that as
  // "still generating" and waits forever. "__proto__" yields an object, violating the declared
  // `string | null`.
  it.each(["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"])(
    "does not leak Object.prototype for the key %s",
    (key) => {
      const out = toFinishReason(key);
      expect(typeof out).toBe("string");
      expect(out).toBe(OPENAI_FINISH_REASON.STOP);
    }
  );

  it("keeps the table free of inherited keys", () => {
    expect(Object.hasOwn(STOP_REASON_TO_FINISH_REASON, "constructor")).toBe(false);
  });
});
