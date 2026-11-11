import type { ProviderFlagMap } from "../../cli/generic.options";
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
  ACP: "--acp",
  MODEL: "--model",
  OUTPUT_FORMAT: "--output-format",
  APPROVAL_MODE: "--approval-mode",
  INCLUDE_DIRECTORIES: "--include-directories",
  SANDBOX: "--sandbox",
  ALLOWED_MCP_SERVER_NAMES: "--allowed-mcp-server-names",
  DEBUG: "--debug",
} as const;

/** Map generic option keys to Gemini CLI flag names. */
export const GEMINI_GENERIC_FLAG_MAP: ProviderFlagMap<typeof GEMINI_CLI_ARG> = {
  [GENERIC_OPTION_KEY.MODEL]: GEMINI_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: GEMINI_CLI_ARG.OUTPUT_FORMAT,
  [GENERIC_OPTION_KEY.DEBUG]: GEMINI_CLI_ARG.DEBUG,
};
