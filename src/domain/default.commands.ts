/**
 * Default CLI command and args per provider. No literal command or arg strings in provider implementations.
 */
export const DEFAULT_COMMANDS = {
  CLAUDE_DEFAULT_COMMAND: "claude-code-acp",
  CLAUDE_DEFAULT_ARGS: [] as string[],
  GEMINI_DEFAULT_COMMAND: "gemini",
  GEMINI_DEFAULT_ARGS: ["--experimental-acp"],
  CODEX_DEFAULT_COMMAND: "codex",
  CODEX_DEFAULT_ARGS: ["--experimental-acp"],
  CURSOR_DEFAULT_COMMAND: "cursor-agent",
  CURSOR_DEFAULT_ARGS: [] as string[],
} as const;

export const {
  CLAUDE_DEFAULT_COMMAND,
  CLAUDE_DEFAULT_ARGS,
  GEMINI_DEFAULT_COMMAND,
  GEMINI_DEFAULT_ARGS,
  CODEX_DEFAULT_COMMAND,
  CODEX_DEFAULT_ARGS,
  CURSOR_DEFAULT_COMMAND,
  CURSOR_DEFAULT_ARGS,
} = DEFAULT_COMMANDS;
