/**
 * Environment variable keys for @simpill/acp-llm-cli.
 * All env access must use these constants; no raw strings in code.
 */
export const ENV_KEY = {
  ACP_LLM_CLI_DEBUG: "ACP_LLM_CLI_DEBUG",
  ACP_LLM_CLI_LIVE: "ACP_LLM_CLI_LIVE",
  ACP_LLM_CLI_PROVIDER: "ACP_LLM_CLI_PROVIDER",
  ACP_LLM_CLI_MODELS_DRY_RUN: "ACP_LLM_CLI_MODELS_DRY_RUN",
  ACP_LLM_CLI_CLAUDE_COMMAND: "ACP_LLM_CLI_CLAUDE_COMMAND",
  ACP_LLM_CLI_CLAUDE_ARGS: "ACP_LLM_CLI_CLAUDE_ARGS",
  ACP_LLM_CLI_GEMINI_COMMAND: "ACP_LLM_CLI_GEMINI_COMMAND",
  ACP_LLM_CLI_GEMINI_ARGS: "ACP_LLM_CLI_GEMINI_ARGS",
  ACP_LLM_CLI_CODEX_COMMAND: "ACP_LLM_CLI_CODEX_COMMAND",
  ACP_LLM_CLI_CODEX_ARGS: "ACP_LLM_CLI_CODEX_ARGS",
  ACP_LLM_CLI_CURSOR_COMMAND: "ACP_LLM_CLI_CURSOR_COMMAND",
  ACP_LLM_CLI_CURSOR_ARGS: "ACP_LLM_CLI_CURSOR_ARGS",
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  GOOGLE_API_KEY: "GOOGLE_API_KEY",
  GEMINI_API_KEY: "GEMINI_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  CURSOR_API_KEY: "CURSOR_API_KEY",
  XAI_API_KEY: "XAI_API_KEY",
} as const;

export type EnvKey = (typeof ENV_KEY)[keyof typeof ENV_KEY];

/**
 * The .env files this package will load, in precedence order - the same defaults
 * @simpill/env.utils uses. Declared here because that package does not export them
 * and env.reader must filter the list before handing it over.
 */
export const ENV_FILE_PATHS = [".env.local", ".env"] as const;

/** dotenvx's code for a .env path it was asked to load and could not find. */
export const MISSING_ENV_FILE_CODE = "MISSING_ENV_FILE";
