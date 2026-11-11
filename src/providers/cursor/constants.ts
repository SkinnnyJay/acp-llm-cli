import type { ProviderFlagMap } from "../../cli/generic.options";
import { GENERIC_OPTION_KEY } from "../../cli/generic.options";
import type { ENV_KEY } from "../../domain/env.keys";

export const CURSOR_CONFIG_KEYS = {
  COMMAND_KEY: "ACP_LLM_CLI_CURSOR_COMMAND",
  ARGS_KEY: "ACP_LLM_CLI_CURSOR_ARGS",
} as const satisfies Record<string, keyof typeof ENV_KEY>;

/**
 * Flags `cursor-agent` accepts. They are its global options; `acp --help` lists none of its own,
 * and the binary answers the ACP handshake with a global flag on either side of `acp`.
 */
export const CURSOR_CLI_ARG = {
  MODEL: "--model",
  MODE: "--mode",
  SANDBOX: "--sandbox",
  WORKSPACE: "--workspace",
  ADD_DIR: "--add-dir",
  WORKTREE: "--worktree",
  WORKTREE_BASE: "--worktree-base",
  PLUGIN_DIR: "--plugin-dir",
  APPROVE_MCPS: "--approve-mcps",
  TRUST: "--trust",
  VERSION: "--version",
} as const;

/** Map generic option keys to Cursor CLI flag names. */
export const CURSOR_GENERIC_FLAG_MAP: ProviderFlagMap<typeof CURSOR_CLI_ARG> = {
  [GENERIC_OPTION_KEY.MODEL]: CURSOR_CLI_ARG.MODEL,
  [GENERIC_OPTION_KEY.TRUST]: CURSOR_CLI_ARG.TRUST,
  [GENERIC_OPTION_KEY.SANDBOX]: CURSOR_CLI_ARG.SANDBOX,
  [GENERIC_OPTION_KEY.WORKSPACE]: CURSOR_CLI_ARG.WORKSPACE,
};
