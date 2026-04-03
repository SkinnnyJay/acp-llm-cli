import { z } from "zod";
import { INPUT_FORMAT, OUTPUT_FORMAT, SANDBOX_MODE } from "../domain/cli.options";

/**
 * Options common across LLM CLIs. Providers extend base config with these (or a subset)
 * and map them to their CLI's flag names via GenericFlagMap.
 */
export const genericLlmCliOptionsSchema = z.object({
  model: z.string().optional(),
  outputFormat: z
    .enum([OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.TEXT, OUTPUT_FORMAT.STREAM_JSON])
    .optional(),
  inputFormat: z.enum([INPUT_FORMAT.TEXT, INPUT_FORMAT.STREAM_JSON]).optional(),
  stream: z.boolean().optional(),
  trust: z.boolean().optional(),
  sandbox: z.enum([SANDBOX_MODE.ENABLED, SANDBOX_MODE.DISABLED]).optional(),
  workspace: z.string().optional(),
  resume: z.string().optional(),
  sessionId: z.string().optional(),
  verbose: z.boolean().optional(),
  debug: z.boolean().optional(),
  print: z.boolean().optional(),
});

export type GenericLlmCliOptions = z.infer<typeof genericLlmCliOptionsSchema>;

/**
 * Keys of generic options that can be emitted as CLI flags.
 * Providers supply the actual flag string for each (e.g. MODEL -> "--model").
 */
export const GENERIC_OPTION_KEY = {
  MODEL: "model",
  OUTPUT_FORMAT: "outputFormat",
  INPUT_FORMAT: "inputFormat",
  STREAM: "stream",
  TRUST: "trust",
  SANDBOX: "sandbox",
  WORKSPACE: "workspace",
  RESUME: "resume",
  SESSION_ID: "sessionId",
  VERBOSE: "verbose",
  DEBUG: "debug",
  PRINT: "print",
} as const;

export type GenericOptionKey = (typeof GENERIC_OPTION_KEY)[keyof typeof GENERIC_OPTION_KEY];

/**
 * Map from generic option key to this provider's CLI flag (e.g. "--model").
 * Only include keys the provider supports; arg builder skips missing keys.
 */
export type GenericFlagMap = Partial<Record<GenericOptionKey, string>>;

/**
 * Default values for generic options when not set.
 * Used by arg builder to decide whether to emit a flag (e.g. stream: true => emit --stream).
 */
export const GENERIC_OPTION_DEFAULTS: GenericLlmCliOptions = {
  stream: true,
  trust: false,
  verbose: false,
  debug: false,
  print: false,
};
