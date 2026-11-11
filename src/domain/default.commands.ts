/**
 * Default CLI command and args per provider. No literal command or arg strings in provider implementations.
 *
 * - Claude → `claude-agent-acp` (npm: @agentclientprotocol/claude-agent-acp)
 * - Codex → `codex-acp` (npm: @agentclientprotocol/codex-acp)
 * - Cursor → `cursor-agent acp`
 * - Antigravity → `agy acp`
 */
export const DEFAULT_COMMANDS = {
  CLAUDE_DEFAULT_COMMAND: "claude-agent-acp",
  CLAUDE_DEFAULT_ARGS: [] as const,
  ANTIGRAVITY_DEFAULT_COMMAND: "agy",
  ANTIGRAVITY_DEFAULT_ARGS: ["acp"] as const,
  CODEX_DEFAULT_COMMAND: "codex-acp",
  CODEX_DEFAULT_ARGS: [] as const,
  CURSOR_DEFAULT_COMMAND: "cursor-agent",
  CURSOR_DEFAULT_ARGS: ["acp"] as const,
} as const;
