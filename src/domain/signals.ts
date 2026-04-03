/**
 * Process signals used for child process control.
 */
export const SIGNAL = {
  TERM: "SIGTERM",
  KILL: "SIGKILL",
} as const;

export type Signal = (typeof SIGNAL)[keyof typeof SIGNAL];
