/**
 * Permission request outcomes reported by agents.
 */
export const PERMISSION_OUTCOME = {
  CANCELLED: "cancelled",
  SELECTED: "selected",
} as const;

export type PermissionOutcome =
  (typeof PERMISSION_OUTCOME)[keyof typeof PERMISSION_OUTCOME];
