/**
 * Numeric limits (stderr line cap, max retries, etc.). No magic numbers in code.
 */
export const LIMIT = {
  STDERR_LINES: 100,
  MAX_RETRIES: 3,
  RETRY_EXPONENTIAL_BASE: 2,
  MS_PER_SECOND: 1000,
} as const;
