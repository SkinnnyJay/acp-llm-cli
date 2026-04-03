import type { GenericFlagMap } from "../../cli/generic.options";
import { GENERIC_OPTION_KEY } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

/**
 * Env keys used for Claude CLI config resolution.
 */
export const CLAUDE_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_CLAUDE_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_CLAUDE_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/** Claude CLI flags. No magic strings in adapter or arg builder. */
export const CLAUDE_CLI_ARG = {
  MODEL: "--model",
  OUTPUT_FORMAT: "--output-format",
  INPUT_FORMAT: "--input-format",
  STREAM_JSON: "stream-json",
  JSON: "json",
  TEXT: "text",
  PRINT: "--print",
  RESUME: "--resume",
  SESSION_ID: "--session-id",
  CONTINUE: "--continue",
  VERBOSE: "--verbose",
  INCLUDE_PARTIAL_MESSAGES: "--include-partial-messages",
  REPLAY_USER_MESSAGES: "--replay-user-messages",
  AUTH: "auth",
  STATUS: "status",
  MODELS: "models",
} as const;

/** Map generic option keys to Claude CLI flag names. */
export const CLAUDE_GENERIC_FLAG_MAP: GenericFlagMap = {
  [GENERIC_OPTION_KEY.MODEL]: CLAUDE_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: CLAUDE_CLI_ARG.OUTPUT_FORMAT,
  [GENERIC_OPTION_KEY.INPUT_FORMAT]: CLAUDE_CLI_ARG.INPUT_FORMAT,
  [GENERIC_OPTION_KEY.TRUST]: "--trust",
  [GENERIC_OPTION_KEY.RESUME]: CLAUDE_CLI_ARG.RESUME,
  [GENERIC_OPTION_KEY.SESSION_ID]: CLAUDE_CLI_ARG.SESSION_ID,
  [GENERIC_OPTION_KEY.VERBOSE]: CLAUDE_CLI_ARG.VERBOSE,
  [GENERIC_OPTION_KEY.PRINT]: CLAUDE_CLI_ARG.PRINT,
};
