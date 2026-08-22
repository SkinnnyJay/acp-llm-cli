/**
 * OpenAI-compatible envelope constants and defaults.
 */
export const OPENAI_COMPAT = {
  OBJECT_CHUNK: "chat.completion.chunk",
  DEFAULT_MODEL_ID: "acp-agent",
} as const;

export type OpenAICompat = (typeof OPENAI_COMPAT)[keyof typeof OPENAI_COMPAT];

/**
 * The closed set of finish_reason values an OpenAI-compatible client understands. ACP stop
 * reasons are translated into this domain by STOP_REASON_TO_FINISH_REASON.
 */
export const OPENAI_FINISH_REASON = {
  STOP: "stop",
  LENGTH: "length",
  CONTENT_FILTER: "content_filter",
  TOOL_CALLS: "tool_calls",
} as const;

export type OpenAIFinishReason = (typeof OPENAI_FINISH_REASON)[keyof typeof OPENAI_FINISH_REASON];
