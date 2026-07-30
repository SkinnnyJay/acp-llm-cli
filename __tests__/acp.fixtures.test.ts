import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENVELOPE_MODE } from "../src/domain/envelope.mode";
import { isNativeEnvelope, isOpenAIEnvelope } from "../src/domain/stream.envelopes";
import { sessionUpdateToEnvelopes } from "../src/runtime/envelope.mapper";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures/acp/session-updates.jsonl");

describe("ACP session update fixtures", () => {
  it("maps golden jsonl lines to envelope invariants", () => {
    const lines = readFileSync(FIXTURE, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Parameters<typeof sessionUpdateToEnvelopes>[0]);

    expect(lines.length).toBeGreaterThanOrEqual(2);

    for (const update of lines) {
      const both = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.BOTH);
      expect(both.some(isNativeEnvelope)).toBe(true);

      const hasText =
        update.update &&
        typeof update.update === "object" &&
        "content" in update.update &&
        (update.update as { content?: { type?: string; text?: string } }).content?.type ===
          "text" &&
        typeof (update.update as { content?: { text?: string } }).content?.text === "string";

      if (
        hasText &&
        (update.update as { sessionUpdate?: string }).sessionUpdate === "agent_message_chunk"
      ) {
        expect(both.some(isOpenAIEnvelope)).toBe(true);
      }
    }

    const firstUpdate = lines[0];
    if (!firstUpdate) throw new Error("fixture missing first line");
    const first = sessionUpdateToEnvelopes(firstUpdate, ENVELOPE_MODE.OPENAI);
    expect(first).toHaveLength(1);
    expect(isOpenAIEnvelope(first[0])).toBe(true);
    expect(first[0]).toMatchObject({
      choices: [{ delta: { content: "Hello" } }],
    });
  });
});
