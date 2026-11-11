/**
 * Error messages used by connection and client. No raw strings in business logic.
 */
export const ERROR_MESSAGE = {
  ACP_STREAM_UNAVAILABLE: "ACP stream unavailable",
  ACP_CLIENT_NOT_CONNECTED: "ACP client not connected",
  ACP_LINK_CLOSED: "ACP connection to the agent closed unexpectedly; call connect() to reconnect",
  FILE_SYSTEM_TOOLS_NOT_CONFIGURED: "File system tools not configured",
  TERMINAL_TOOLS_NOT_CONFIGURED: "Terminal tools not configured",
  STREAM_PROMPT_NOT_SUPPORTED: "streamPrompt is not supported by the inner agent port",
  SESSION_PERSISTENCE_PROVIDER_ID_REQUIRED:
    "providerId is required when sessionPersistence is provided",
  HELP_EXTRACTION_TIMEOUT: (timeoutMs: number) => `Help extraction timed out after ${timeoutMs}ms`,
  HELP_COMMAND_FAILED: (code: number | string, suffix: string, stderr: string) =>
    `Help command exited ${code}${suffix}. stderr: ${stderr}`,
  STREAM_PROMPT_IN_PROGRESS: "Another streamPrompt is already in progress on this port",
  AGENT_PROCESS_EXITED: (code: number | string, suffix: string, details: string) =>
    `Agent process exited with code ${code}${suffix}${details}`,
  CLI_NOT_FOUND: (command: string) =>
    `Agent CLI not found: "${command}" is not installed or not on PATH`,
  WORKING_DIRECTORY_NOT_FOUND: (cwd: string) =>
    `Could not start the agent: working directory "${cwd}" does not exist`,
  /** One trailing period is dropped from `message` so it never ends up as "..". */
  WITH_HINT: (message: string, hint: string) =>
    `${message.endsWith(".") ? message.slice(0, -1) : message}. ${hint}`,
  HINT_INSTALL: (install: string) => `Install it with: ${install}`,
  HINT_LOGIN: (login: string) => `Sign in with: ${login}`,
} as const;
