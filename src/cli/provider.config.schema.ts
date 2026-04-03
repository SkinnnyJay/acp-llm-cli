import { z } from "zod";
import { baseCliConfigSchema } from "../runtime/config";
import { genericLlmCliOptionsSchema } from "./generic.options";

export function createProviderConfigSchema(modelSchema: z.ZodTypeAny) {
  return baseCliConfigSchema.and(
    genericLlmCliOptionsSchema.partial().extend({
      model: z.union([modelSchema, z.string()]).optional(),
    })
  );
}
