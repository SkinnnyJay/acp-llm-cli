/**
 * All timeout and backoff values. No magic numbers in connection or client code.
 */
export const TIMEOUT = {
  DISCONNECT_FORCE_MS: 500,
  BACKOFF_BASE_MS: 250,
  BACKOFF_CAP_MS: 5000,
  /** Max wall time for CLI help extraction. */
  HELP_EXTRACTION_MS: 10_000,
} as const;
