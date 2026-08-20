import type { ProviderFlagMap } from "../../cli/generic.options";
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

/**
 * Map generic option keys to Claude CLI flag names. Typed as a projection of CLAUDE_CLI_ARG so a
 * flag that the provider never declared - as `--trust` was, the only raw literal here and not a
 * claude-agent-acp flag at all - becomes a compile error rather than wrong discovery metadata.
 */
export const CLAUDE_GENERIC_FLAG_MAP: ProviderFlagMap<typeof CLAUDE_CLI_ARG> = {
  [GENERIC_OPTION_KEY.MODEL]: CLAUDE_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.OUTPUT_FORMAT]: CLAUDE_CLI_ARG.OUTPUT_FORMAT,
  [GENERIC_OPTION_KEY.INPUT_FORMAT]: CLAUDE_CLI_ARG.INPUT_FORMAT,
  [GENERIC_OPTION_KEY.RESUME]: CLAUDE_CLI_ARG.RESUME,
  [GENERIC_OPTION_KEY.SESSION_ID]: CLAUDE_CLI_ARG.SESSION_ID,
  [GENERIC_OPTION_KEY.VERBOSE]: CLAUDE_CLI_ARG.VERBOSE,
  [GENERIC_OPTION_KEY.PRINT]: CLAUDE_CLI_ARG.PRINT,
};
