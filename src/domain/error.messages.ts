/**
 * Error messages used by connection and client. No raw strings in business logic.
 */
export const ERROR_MESSAGE = {
  ACP_STREAM_UNAVAILABLE: "ACP stream unavailable",
  ACP_CLIENT_NOT_CONNECTED: "ACP client not connected",
  FILE_SYSTEM_TOOLS_NOT_CONFIGURED: "File system tools not configured",
  TERMINAL_TOOLS_NOT_CONFIGURED: "Terminal tools not configured",
  CURSOR_CLI_CHECK_FAILED: "Cursor CLI check failed",
  CURSOR_COMMAND_TIMEOUT: (timeoutMs: number) =>
    `Cursor CLI command timed out after ${timeoutMs}ms`,
  CURSOR_RESULT_MISSING: "Cursor CLI returned no result line in output",
  STREAM_PROMPT_NOT_SUPPORTED: "streamPrompt is not supported by the inner agent port",
  SESSION_PERSISTENCE_PROVIDER_ID_REQUIRED:
    "providerId is required when sessionPersistence is provided",
  HELP_EXTRACTION_TIMEOUT: (timeoutMs: number) => `Help extraction timed out after ${timeoutMs}ms`,
  HELP_COMMAND_FAILED: (code: number, stderr: string) =>
    `Help command exited ${code}. stderr: ${stderr}`,
  AGENT_PROCESS_EXITED: (code: number | string, suffix: string, details: string) =>
    `Agent process exited with code ${code}${suffix}${details}`,
} as const;
