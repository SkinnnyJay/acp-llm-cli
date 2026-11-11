import type { ProviderFlagMap } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

export const ANTIGRAVITY_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_ANTIGRAVITY_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_ANTIGRAVITY_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/** Flags of the `agy acp` subcommand; they go after `acp` (`agy acp --sandbox`). */
export const ANTIGRAVITY_CLI_ARG = {
  ADD_DIR: "--add-dir",
  AGENT: "--agent",
  SANDBOX: "--sandbox",
  DANGEROUSLY_SKIP_PERMISSIONS: "--dangerously-skip-permissions",
  PROCESS_PER_SESSION: "--process-per-session",
  DISABLE_TELEMETRY: "--disable-telemetry",
  LOG_FILE: "--log-file",
  LOGIN: "--login",
} as const;

/**
 * No generic key is mapped: `agy acp` has no model, trust, workspace, debug or output-format flag,
 * and its `--sandbox` is a bare boolean while the builder emits `--sandbox <value>`.
 */
export const ANTIGRAVITY_GENERIC_FLAG_MAP: ProviderFlagMap<typeof ANTIGRAVITY_CLI_ARG> = {};
