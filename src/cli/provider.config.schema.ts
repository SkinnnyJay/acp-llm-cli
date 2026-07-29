import { z } from "zod";
import { baseCliConfigSchema } from "../runtime/config";
import { genericLlmCliOptionsSchema } from "./generic.options";

export function createProviderConfigSchema<T extends z.ZodType>(modelSchema: T) {
  return baseCliConfigSchema.and(
    genericLlmCliOptionsSchema.partial().extend({
      model: z.union([modelSchema, z.string()]).optional(),
    })
  );
}
