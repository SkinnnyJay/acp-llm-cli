import type { ProviderFlagMap } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

export const ANTIGRAVITY_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_ANTIGRAVITY_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_ANTIGRAVITY_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/**
 * Flags `agy` accepts. Empty until `npm run refresh:help` is run on a machine with `agy`
 * installed: only flags present in the saved help fixture may be declared here.
 */
export const ANTIGRAVITY_CLI_ARG = {} as const;

/** Map generic option keys to Antigravity CLI flag names. Empty until the flag table is filled. */
export const ANTIGRAVITY_GENERIC_FLAG_MAP: ProviderFlagMap<typeof ANTIGRAVITY_CLI_ARG> = {};
