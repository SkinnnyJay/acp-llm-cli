import type { z } from "zod";
import { acpCliConfigSchema } from "../../cli/provider.config.schema";

/**
 * Cursor CLI config: base command/args/cwd/env plus generic LLM options. Cursor runs as an ACP
 * server (`cursor-agent acp`): `mode` is selected over the protocol; `model`, `trust`, `sandbox`
 * and `workspace` are passed as spawn flags.
 */
export const cursorConfigSchema = acpCliConfigSchema;

export type CursorConfig = z.infer<typeof cursorConfigSchema>;
