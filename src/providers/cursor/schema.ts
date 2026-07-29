import { z } from "zod";
import { genericLlmCliOptionsSchema } from "../../cli/generic.options";
import { TIMEOUT } from "../../domain/timeouts";
import { baseCliConfigSchema } from "../../runtime/config";
import { CURSOR_MODE } from "./constants";

/**
 * Cursor CLI config. Accepts app harness options (force, browser, approveMcps, approvalTimeoutMs)
 * for config compatibility; minimal CursorAgentPort uses mode, model, workspacePath.
 */
export const cursorConfigSchema = baseCliConfigSchema.and(genericLlmCliOptionsSchema.partial()).and(
  z.object({
    mode: z.enum(Object.values(CURSOR_MODE) as [string, ...string[]]).optional(),
    workspacePath: z.string().optional(),
    force: z.boolean().optional(),
    browser: z.boolean().optional(),
    approveMcps: z.boolean().optional(),
    approvalTimeoutMs: z
      .number()
      .int()
      .min(TIMEOUT.CURSOR_APPROVAL_TIMEOUT_MIN_MS)
      .max(300_000)
      .optional(),
  })
);

export type CursorConfig = z.infer<typeof cursorConfigSchema>;
