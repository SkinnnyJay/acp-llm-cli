import type { SessionNotification } from "@agentclientprotocol/sdk";
import { ENVELOPE_KIND } from "./envelope.kind";
import { OPENAI_COMPAT } from "./openai.compat";

/**
 * OpenAI-compatible stream chunk envelope (chat.completion.chunk style).
 * Enables consumers to use OpenAI SDKs or unified streaming clients.
 */
export interface OpenAIStyleChunkEnvelope {
  id: string;
  object: typeof OPENAI_COMPAT.OBJECT_CHUNK;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string; role?: string };
    finish_reason: string | null;
  }>;
}

/**
 * Provider-native envelope: raw ACP session update. Use when consumer handles ACP directly.
 */
export interface NativeEnvelope {
  kind: typeof ENVELOPE_KIND.NATIVE;
  update: SessionNotification;
}

/**
 * Union of stream envelope types for dual-mode output.
 */
export type StreamEnvelope = OpenAIStyleChunkEnvelope | NativeEnvelope;

export function isNativeEnvelope(envelope: StreamEnvelope): envelope is NativeEnvelope {
  return "kind" in envelope && envelope.kind === ENVELOPE_KIND.NATIVE;
}

export function isOpenAIEnvelope(envelope: StreamEnvelope): envelope is OpenAIStyleChunkEnvelope {
  return "object" in envelope && envelope.object === OPENAI_COMPAT.OBJECT_CHUNK;
}
