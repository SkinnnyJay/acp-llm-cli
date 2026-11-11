import type { ProviderFlagMap } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

/**
 * Env keys used for Codex CLI config resolution.
 */
export const CODEX_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_CODEX_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_CODEX_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/**
 * Flags `codex-acp` accepts. It takes none: it ignores `--help` and serves ACP on stdio, so its
 * saved help is empty and the table is too.
 */
export const CODEX_CLI_ARG = {} as const;

/** Map generic option keys to Codex CLI flag names. */
export const CODEX_GENERIC_FLAG_MAP: ProviderFlagMap<typeof CODEX_CLI_ARG> = {};
