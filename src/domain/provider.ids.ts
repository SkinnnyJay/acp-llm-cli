/**
 * Default adapter ids and display names per provider. Used by providers and bootstrap API only via these constants.
 */
export const PROVIDER_IDS = {
  CLAUDE_CLI_ID: "claude-cli",
  CLAUDE_CLI_NAME: "Claude CLI",
  /** @experimental Has not yet been run against a real `agy` binary. */
  ANTIGRAVITY_CLI_ID: "antigravity-cli",
  ANTIGRAVITY_CLI_NAME: "Antigravity CLI",
  CODEX_CLI_ID: "codex-cli",
  CODEX_CLI_NAME: "Codex CLI",
  CURSOR_CLI_ID: "cursor-cli",
  CURSOR_CLI_NAME: "Cursor CLI",
} as const;
