import type { StopReason } from "@agentclientprotocol/sdk";
import type { OpenAIFinishReason } from "./openai.compat";
import { OPENAI_FINISH_REASON } from "./openai.compat";

/**
 * Stop reasons this package emits. Constrained to the protocol's own StopReason union so this
 * cannot drift from it: the SDK declares five members, and a local alias narrowing it to one
 * made any exhaustive switch over the local type look complete while covering a fifth of the
 * domain. Consumers that need the type should import it from the SDK.
 */
export const STOP_REASON = {
  END_TURN: "end_turn",
} as const satisfies Record<string, StopReason>;

/**
 * Translation from the protocol's stop reasons to OpenAI's finish_reason vocabulary.
 *
 * `satisfies Record<StopReason, ...>` makes the table total by construction: if the SDK adds a
 * sixth stop reason this stops compiling, rather than silently reporting the new outcome as a
 * clean stop the way a hardcoded value did.
 *
 * `cancelled` maps to "stop" deliberately - OpenAI has no cancellation vocabulary, and a null
 * finish_reason means "still generating", which is worse on a terminal chunk than an honest end.
 */
export const STOP_REASON_TO_FINISH_REASON = {
  end_turn: OPENAI_FINISH_REASON.STOP,
  max_tokens: OPENAI_FINISH_REASON.LENGTH,
  max_turn_requests: OPENAI_FINISH_REASON.LENGTH,
  refusal: OPENAI_FINISH_REASON.CONTENT_FILTER,
  cancelled: OPENAI_FINISH_REASON.STOP,
} as const satisfies Record<StopReason, OpenAIFinishReason>;
