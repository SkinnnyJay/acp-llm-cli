/**
 * Stream envelope output mode: OpenAI-compatible chunks, provider-native (ACP) updates, or both.
 */
export const ENVELOPE_MODE = {
  OPENAI: "openai",
  NATIVE: "native",
  BOTH: "both",
} as const;

export type EnvelopeMode = (typeof ENVELOPE_MODE)[keyof typeof ENVELOPE_MODE];
