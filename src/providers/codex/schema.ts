import type { z } from "zod";
import { createProviderConfigSchema } from "../../cli/provider.config.schema";
import { ModelIdSchema as OpenAIModelIdSchema } from "../../domain/models/openai.models";

/**
 * Codex CLI config: base plus generic LLM options (model, sandbox, etc.).
 * model: validated against OpenAI model enum (run npm run update-models to refresh) or any string.
 */
export const codexConfigSchema = createProviderConfigSchema(OpenAIModelIdSchema);

export type CodexConfig = z.infer<typeof codexConfigSchema>;
