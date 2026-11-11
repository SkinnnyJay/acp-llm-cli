import type { ProviderFlagMap } from "../../cli/generic.options";
import { GENERIC_OPTION_KEY } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

export const CURSOR_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_CURSOR_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_CURSOR_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/**
 * Cursor CLI subcommands and flags. No magic strings in cursor code.
 */
export const CURSOR_CLI_ARG = {
  PRINT: "-p",
  OUTPUT_FORMAT: "--output-format",
  STREAM_PARTIAL_OUTPUT: "--stream-partial-output",
  RESUME: "--resume",
  MODEL: "--model",
  MODE: "--mode",
  SANDBOX: "--sandbox",
  WORKSPACE: "--workspace",
  TRUST: "--trust",
  VERSION: "--version",
} as const;

/**
 * Bare subcommands. Kept out of CURSOR_CLI_ARG for the same reason as Claude's: that table is
 * the codomain of ProviderFlagMap, and a non-flag token there lets a generic option be mapped
 * onto a positional argument.
 */
export const CURSOR_CLI_SUBCOMMAND = {
  ACP: "acp",
} as const;

/** Map generic option keys to Cursor CLI flag names. */
export const CURSOR_GENERIC_FLAG_MAP: ProviderFlagMap<typeof CURSOR_CLI_ARG> = {
  [GENERIC_OPTION_KEY.MODEL]: CURSOR_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: CURSOR_CLI_ARG.OUTPUT_FORMAT,
  [GENERIC_OPTION_KEY.TRUST]: CURSOR_CLI_ARG.TRUST,
  [GENERIC_OPTION_KEY.SANDBOX]: CURSOR_CLI_ARG.SANDBOX,
  [GENERIC_OPTION_KEY.WORKSPACE]: CURSOR_CLI_ARG.WORKSPACE,
  [GENERIC_OPTION_KEY.RESUME]: CURSOR_CLI_ARG.RESUME,
  [GENERIC_OPTION_KEY.PRINT]: CURSOR_CLI_ARG.PRINT,
};
