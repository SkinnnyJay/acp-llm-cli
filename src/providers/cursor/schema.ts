import type { z } from "zod";
import { acpCliConfigSchema } from "../../cli/provider.config.schema";

/**
 * Cursor CLI config: base command/args/cwd/env plus generic LLM options. Cursor runs as an ACP
 * server (`cursor-agent acp`), so mode and model are selected over the protocol, not by flags.
 */
export const cursorConfigSchema = acpCliConfigSchema;

export type CursorConfig = z.infer<typeof cursorConfigSchema>;
