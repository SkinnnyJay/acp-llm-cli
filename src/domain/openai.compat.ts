/**
 * OpenAI-compatible envelope constants and defaults.
 */
export const OPENAI_COMPAT = {
  OBJECT_CHUNK: "chat.completion.chunk",
  FINISH_REASON_STOP: "stop",
  DEFAULT_MODEL_ID: "acp-agent",
} as const;

export type OpenAICompat = (typeof OPENAI_COMPAT)[keyof typeof OPENAI_COMPAT];
