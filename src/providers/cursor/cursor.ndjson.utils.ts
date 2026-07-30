import { z } from "zod";
import { CURSOR_NDJSON_SUBTYPE, CURSOR_NDJSON_TYPE } from "./constants";

export const cursorResultLineSchema = z
  .object({
    type: z.literal(CURSOR_NDJSON_TYPE.RESULT),
    subtype: z.literal(CURSOR_NDJSON_SUBTYPE.SUCCESS),
    result: z.string().optional(),
    session_id: z.string().optional(),
  })
  .passthrough();

export interface CursorNdjsonParseResult {
  result?: string;
  sessionId?: string;
}

export function parseCursorNdjsonResult(stdout: string): CursorNdjsonParseResult | null {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  // Walk newest → oldest so the last matching result line wins.
  for (const line of lines.reverse()) {
    try {
      const parsed = cursorResultLineSchema.safeParse(JSON.parse(line));
      if (parsed.success) {
        return {
          result: parsed.data.result,
          sessionId: parsed.data.session_id,
        };
      }
    } catch {
      // skip malformed lines
    }
  }
  return null;
}
