/**
 * All timeout and backoff values. No magic numbers in connection or client code.
 */
export const TIMEOUT = {
  DISCONNECT_FORCE_MS: 500,
  BACKOFF_BASE_MS: 250,
  BACKOFF_CAP_MS: 5000,
  /** Max wall time for a single Cursor CLI prompt invocation. */
  CURSOR_PROMPT_MS: 300_000,
  /** Max wait for active prompt to finish before disconnect. */
  CURSOR_GRACEFUL_SHUTDOWN_MS: 30_000,
  /** Poll interval while waiting for prompts to finish. */
  CURSOR_GRACEFUL_SHUTDOWN_POLL_MS: 100,
  /** Force-kill grace window after SIGTERM. */
  CURSOR_FORCE_KILL_MS: 2000,
  /** Minimum approval timeout for Cursor CLI. */
  CURSOR_APPROVAL_TIMEOUT_MIN_MS: 100,
  /** Max wall time for CLI help extraction. */
  HELP_EXTRACTION_MS: 10_000,
} as const;
