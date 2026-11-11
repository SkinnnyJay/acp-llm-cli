import { z } from "zod";
import { OUTPUT_FORMAT, SANDBOX_MODE } from "../domain/cli.options";

/**
 * Options common across LLM CLIs. Providers extend base config with these (or a subset)
 * and map them to their CLI's flag names via GenericFlagMap.
 */
export const genericLlmCliOptionsSchema = z.object({
  model: z.string().optional(),
  outputFormat: z
    .enum([OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.TEXT, OUTPUT_FORMAT.STREAM_JSON])
    .optional(),
  trust: z.boolean().optional(),
  sandbox: z.enum([SANDBOX_MODE.ENABLED, SANDBOX_MODE.DISABLED]).optional(),
  workspace: z.string().optional(),
  debug: z.boolean().optional(),
});

export type GenericLlmCliOptions = z.infer<typeof genericLlmCliOptionsSchema>;

/**
 * Keys of generic options that can be emitted as CLI flags.
 * Providers supply the actual flag string for each (e.g. MODEL -> "--model").
 */
export const GENERIC_OPTION_KEY = {
  MODEL: "model",
  OUTPUT_FORMAT: "outputFormat",
  TRUST: "trust",
  SANDBOX: "sandbox",
  WORKSPACE: "workspace",
  DEBUG: "debug",
} as const;

export type GenericOptionKey = (typeof GENERIC_OPTION_KEY)[keyof typeof GENERIC_OPTION_KEY];

/**
 * Map from generic option key to this provider's CLI flag (e.g. "--model").
 * Only include keys the provider supports; arg builder skips missing keys.
 */
export type GenericFlagMap = Partial<Record<GenericOptionKey, string>>;

/**
 * A provider's flag map, constrained to flags that provider actually declares. Assignable to
 * GenericFlagMap, so nothing downstream changes - it just stops an undeclared flag string from
 * being invented at the map.
 */
export type ProviderFlagMap<TFlags extends Record<string, string>> = Partial<
  Record<GenericOptionKey, TFlags[keyof TFlags]>
>;
