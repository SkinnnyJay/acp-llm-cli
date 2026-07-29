/**
 * Default CLI command and args per provider. No literal command or arg strings in provider implementations.
 *
 * Aligned with ACPX built-in agent wrappers (acpx 0.5+):
 * - Claude → preferred bin `claude-agent-acp` (@agentclientprotocol/claude-agent-acp)
 * - Codex → preferred bin `codex-acp` (@zed-industries/codex-acp)
 * - Cursor → `cursor-agent` print/stream-json port (this package); ACP mode is `cursor-agent acp` via ACPX
 * - Gemini → `gemini --experimental-acp`
 */
export const DEFAULT_COMMANDS = {
  CLAUDE_DEFAULT_COMMAND: "claude-agent-acp",
  CLAUDE_DEFAULT_ARGS: [] as string[],
  GEMINI_DEFAULT_COMMAND: "gemini",
  GEMINI_DEFAULT_ARGS: ["--experimental-acp"],
  CODEX_DEFAULT_COMMAND: "codex-acp",
  CODEX_DEFAULT_ARGS: [] as string[],
  CURSOR_DEFAULT_COMMAND: "cursor-agent",
  CURSOR_DEFAULT_ARGS: [] as string[],
} as const;
