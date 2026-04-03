/**
 * Stop reasons reported by agents.
 */
export const STOP_REASON = {
  END_TURN: "end_turn",
} as const;

export type StopReason = (typeof STOP_REASON)[keyof typeof STOP_REASON];
