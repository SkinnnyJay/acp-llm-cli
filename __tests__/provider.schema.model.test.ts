import { describe, expect, it } from "vitest";
import { claudeConfigSchema } from "../src/providers/claude/schema";
import { codexConfigSchema } from "../src/providers/codex/schema";
import { geminiConfigSchema } from "../src/providers/gemini/schema";

const base = { command: "x", args: [], env: {} };

const schemas = [
  ["claude", claudeConfigSchema],
  ["codex", codexConfigSchema],
  ["gemini", geminiConfigSchema],
] as const;

describe("ACP provider config schemas: model is a free-form label, not vendor-validated", () => {
  // Characterisation. The per-vendor ModelIdSchema was threaded through a generic parameter and
  // then unioned with z.string(), which accepts a strict superset of any enum - so the vendor
  // enum rejected nothing and the inferred type widened to string. Three JSDoc comments claimed
  // the model was "validated against" the vendor enum, which was never true. These cases pin the
  // real behaviour so removing the inert generic is provably behaviour-neutral.
  for (const [name, schema] of schemas) {
    it(`${name} accepts another vendor's model id`, () => {
      expect(schema.safeParse({ ...base, model: "gpt-5-codex" }).success).toBe(true);
      expect(schema.safeParse({ ...base, model: "claude-sonnet-4-6" }).success).toBe(true);
      expect(schema.safeParse({ ...base, model: "gemini-3-pro" }).success).toBe(true);
    });

    it(`${name} accepts a model id that does not exist at all`, () => {
      expect(schema.safeParse({ ...base, model: "not-a-real-model" }).success).toBe(true);
    });

    it(`${name} still rejects a non-string model`, () => {
      expect(schema.safeParse({ ...base, model: 42 }).success).toBe(false);
    });
  }
});
