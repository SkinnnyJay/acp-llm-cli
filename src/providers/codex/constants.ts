import type { GenericFlagMap } from "../../cli/generic.options";
import { GENERIC_OPTION_KEY } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

/**
 * Env keys used for Codex CLI config resolution.
 */
export const CODEX_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_CODEX_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_CODEX_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/** Codex CLI flags. */
export const CODEX_CLI_ARG = {
  EXPERIMENTAL_ACP: "--experimental-acp",
  SANDBOX: "--sandbox",
  FULL_AUTO: "--full-auto",
  MODEL: "--model",
  VERBOSE: "--verbose",
  PRINT: "--print",
} as const;

/** Map generic option keys to Codex CLI flag names. */
export const CODEX_GENERIC_FLAG_MAP: GenericFlagMap = {
  [GENERIC_OPTION_KEY.MODEL]: CODEX_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.SANDBOX]: CODEX_CLI_ARG.SANDBOX,
  [GENERIC_OPTION_KEY.VERBOSE]: CODEX_CLI_ARG.VERBOSE,
  [GENERIC_OPTION_KEY.PRINT]: CODEX_CLI_ARG.PRINT,
};
