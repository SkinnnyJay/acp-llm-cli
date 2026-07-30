import type { z } from "zod";
import { createProviderConfigSchema } from "../../cli/provider.config.schema";
import { ModelIdSchema as AnthropicModelIdSchema } from "../../domain/models/anthropic.models";

/**
 * Claude CLI config: base command/args/cwd/env plus generic LLM options.
 * model: validated against Anthropic model enum (run npm run update-models to refresh)
 * or any string (open escape for new model ids / overrides).
 */
export const claudeConfigSchema = createProviderConfigSchema(AnthropicModelIdSchema);

export type ClaudeConfig = z.infer<typeof claudeConfigSchema>;
