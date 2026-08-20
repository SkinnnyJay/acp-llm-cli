import type { StopReason } from "@agentclientprotocol/sdk";

/**
 * Stop reasons this package emits. Constrained to the protocol's own StopReason union so this
 * cannot drift from it: the SDK declares five members, and a local alias narrowing it to one
 * made any exhaustive switch over the local type look complete while covering a fifth of the
 * domain. Consumers that need the type should import it from the SDK.
 */
export const STOP_REASON = {
  END_TURN: "end_turn",
} as const satisfies Record<string, StopReason>;
