import type { ProviderFlagMap } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

/**
 * Env keys used for Claude CLI config resolution.
 */
export const CLAUDE_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_CLAUDE_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_CLAUDE_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/**
 * Flags `claude-agent-acp` accepts. It takes none: it ignores `--help` and serves ACP on stdio,
 * so its saved help is empty and the table is too.
 */
export const CLAUDE_CLI_ARG = {} as const;

/**
 * Map generic option keys to Claude CLI flag names. Typed as a projection of CLAUDE_CLI_ARG so a
 * flag that the provider never declared - as `--trust` was, the only raw literal here and not a
 * claude-agent-acp flag at all - becomes a compile error rather than wrong discovery metadata.
 */
export const CLAUDE_GENERIC_FLAG_MAP: ProviderFlagMap<typeof CLAUDE_CLI_ARG> = {};
