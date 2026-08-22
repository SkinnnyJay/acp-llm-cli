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

/**
 * Translate an agent-reported stop reason into OpenAI's finish_reason vocabulary.
 *
 * The value is NOT trusted. It arrives from a third-party agent binary over JSON-RPC, and the
 * SDK's `prompt()` passes no `mapResponse`, so the raw JSON result reaches us unvalidated.
 * Indexing the table directly with it reached Object.prototype: "constructor" and "toString"
 * returned Functions - truthy, so a downstream `?? default` never fired, and JSON.stringify
 * drops function-valued properties, shipping a terminal chunk with no finish_reason key at all
 * (an OpenAI client reads that as "still generating" and waits forever). "__proto__" yielded an
 * object, violating the declared `string | null`.
 *
 * An unrecognised-but-benign reason falls back to "stop" deliberately: OpenAI's vocabulary has
 * no "unknown", and a null finish_reason means "still generating", which is worse on a terminal
 * chunk. That fallback is explicit here rather than an accident of a destructuring default.
 */
export function toFinishReason(stopReason: string | undefined): OpenAIFinishReason {
  if (stopReason !== undefined && Object.hasOwn(STOP_REASON_TO_FINISH_REASON, stopReason)) {
    return STOP_REASON_TO_FINISH_REASON[stopReason as StopReason];
  }
  return OPENAI_FINISH_REASON.STOP;
}
