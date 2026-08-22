import type { z } from "zod";
import { acpCliConfigSchema } from "../../cli/provider.config.schema";

/**
 * Claude CLI config: base command/args/cwd/env plus generic LLM options.
 *
 * `model` accepts any string. It is a label, not a constraint: ACP providers select their model
 * over the protocol or via `args`, and the configured value is threaded through as the default
 * model id on OpenAI-style stream envelopes. For validation against the vendor's catalogue,
 * import AnthropicModelIdSchema and parse with it explicitly.
 */
export const claudeConfigSchema = acpCliConfigSchema;

export type ClaudeConfig = z.infer<typeof claudeConfigSchema>;
