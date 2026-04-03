import type { GenericFlagMap } from "../../cli/generic.options";
import { GENERIC_OPTION_KEY } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

/**
 * Env keys used for Gemini CLI config resolution.
 */
export const GEMINI_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_GEMINI_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_GEMINI_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/** Gemini CLI flags. */
export const GEMINI_CLI_ARG = {
  EXPERIMENTAL_ACP: "--experimental-acp",
  MODEL: "--model",
  OUTPUT_FORMAT: "--output-format",
  VERBOSE: "--verbose",
  PRINT: "--print",
} as const;

/** Map generic option keys to Gemini CLI flag names. */
export const GEMINI_GENERIC_FLAG_MAP: GenericFlagMap = {
  [GENERIC_OPTION_KEY.MODEL]: GEMINI_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: GEMINI_CLI_ARG.OUTPUT_FORMAT,
  [GENERIC_OPTION_KEY.VERBOSE]: GEMINI_CLI_ARG.VERBOSE,
  [GENERIC_OPTION_KEY.PRINT]: GEMINI_CLI_ARG.PRINT,
};
