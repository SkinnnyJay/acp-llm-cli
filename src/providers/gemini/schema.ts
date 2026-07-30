import type { z } from "zod";
import { createProviderConfigSchema } from "../../cli/provider.config.schema";
import { ModelIdSchema as GeminiModelIdSchema } from "../../domain/models/gemini.models";

/**
 * Gemini CLI config: base plus generic LLM options.
 * model: validated against Gemini model enum (run npm run update-models to refresh)
 * or any string (open escape for new model ids / overrides).
 */
export const geminiConfigSchema = createProviderConfigSchema(GeminiModelIdSchema);

export type GeminiConfig = z.infer<typeof geminiConfigSchema>;
