import type { z } from "zod";
import { acpCliConfigSchema } from "../../cli/provider.config.schema";

/**
 * Antigravity CLI config: base command/args/cwd/env plus generic LLM options. Antigravity runs as
 * an ACP server (`agy acp`), so mode and model are selected over the protocol, not by flags.
 */
export const antigravityConfigSchema = acpCliConfigSchema;

export type AntigravityConfig = z.infer<typeof antigravityConfigSchema>;
