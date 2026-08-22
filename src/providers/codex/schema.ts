import type { z } from "zod";
import { acpCliConfigSchema } from "../../cli/provider.config.schema";

/**
 * Codex CLI config: base command/args/cwd/env plus generic LLM options.
 *
 * `model` accepts any string. It is a label, not a constraint: ACP providers select their model
 * over the protocol or via `args`, and the configured value is threaded through as the default
 * model id on OpenAI-style stream envelopes. For validation against the vendor's catalogue,
 * import OpenAIModelIdSchema and parse with it explicitly.
 */
export const codexConfigSchema = acpCliConfigSchema;

export type CodexConfig = z.infer<typeof codexConfigSchema>;
