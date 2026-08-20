import { describe, expect, it } from "vitest";
import { modelIdEntries, safeKey } from "../scripts/model.constants";
import { MODEL_IDS as ANTHROPIC } from "../src/domain/models/anthropic.models";
import { MODEL_IDS as GEMINI } from "../src/domain/models/gemini.models";
import { MODEL_IDS as OPENAI } from "../src/domain/models/openai.models";
import { MODEL_IDS as XAI } from "../src/domain/models/xai.models";

describe("model id key derivation", () => {
  it("throws rather than silently renaming when two ids collide", () => {
    // `-` sorts before `.`, so the ordinal strategy would have handed
    // CLAUDE_3_5_HAIKU to the newcomer and demoted the published id to _2.
    expect(() => modelIdEntries(["claude-3-5-haiku", "claude-3.5-haiku"])).toThrow(
      /key collision/i
    );
  });

  it("throws for the colon/dash variant shape upstream already ships", () => {
    expect(() => modelIdEntries(["gpt-4o-extended", "gpt-4o:extended"])).toThrow(/key collision/i);
  });

  it("maps punctuation to underscores", () => {
    expect(safeKey("claude-3.7-sonnet:thinking")).toBe("CLAUDE_3_7_SONNET_THINKING");
  });

  it("accepts every id set currently committed", () => {
    for (const ids of [ANTHROPIC, OPENAI, GEMINI, XAI]) {
      expect(() => modelIdEntries(Object.values(ids))).not.toThrow();
    }
  });

  it("reproduces the committed constant names exactly", () => {
    for (const ids of [ANTHROPIC, OPENAI, GEMINI, XAI]) {
      expect(modelIdEntries(Object.values(ids))).toEqual(ids);
    }
  });
});
