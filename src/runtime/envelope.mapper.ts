import type { SessionNotification } from "@agentclientprotocol/sdk";
import { ENVELOPE_KIND } from "../domain/envelope.kind";
import { ENVELOPE_MODE } from "../domain/envelope.mode";
import type { EnvelopeMode } from "../domain/envelope.mode";
import { LIMIT } from "../domain/limits";
import { OPENAI_COMPAT } from "../domain/openai.compat";
import { SESSION_UPDATE_TYPE } from "../domain/session.update.types";
import type {
  NativeEnvelope,
  OpenAIStyleChunkEnvelope,
  StreamEnvelope,
} from "../domain/stream.envelopes";

type AgentMessageChunkNotification = SessionNotification & {
  update: Extract<
    SessionNotification["update"],
    { sessionUpdate: typeof SESSION_UPDATE_TYPE.AGENT_MESSAGE_CHUNK }
  >;
};

function isAgentMessageChunk(update: SessionNotification): update is AgentMessageChunkNotification {
  return update.update.sessionUpdate === SESSION_UPDATE_TYPE.AGENT_MESSAGE_CHUNK;
}

/**
 * Extract streaming text from an ACP session update if it represents a message chunk.
 * Handles agent_message_chunk-style notifications (SDK-agnostic shape).
 */
function extractChunkText(update: SessionNotification): string | undefined {
  if (!isAgentMessageChunk(update)) {
    return undefined;
  }

  const content = update.update.content;
  if (content.type === "text") {
    return content.text;
  }
  if ("text" in content && typeof content.text === "string") {
    return content.text;
  }
  return undefined;
}

/**
 * Map one ACP session update to stream envelope(s) according to envelope mode.
 * Keeps abstraction internal; no ACP types leak into consumer envelope shape.
 */
export function sessionUpdateToEnvelopes(
  update: SessionNotification,
  envelopeMode: EnvelopeMode,
  options: {
    modelId?: string;
    chunkId?: () => string;
  } = {}
): StreamEnvelope[] {
  const envelopes: StreamEnvelope[] = [];
  const { modelId = OPENAI_COMPAT.DEFAULT_MODEL_ID, chunkId = () => crypto.randomUUID() } = options;

  if (envelopeMode === ENVELOPE_MODE.NATIVE || envelopeMode === ENVELOPE_MODE.BOTH) {
    const native: NativeEnvelope = { kind: ENVELOPE_KIND.NATIVE, update };
    envelopes.push(native);
  }

  if (envelopeMode === ENVELOPE_MODE.OPENAI || envelopeMode === ENVELOPE_MODE.BOTH) {
    const text = extractChunkText(update);
    if (text !== undefined) {
      const openai: OpenAIStyleChunkEnvelope = {
        id: chunkId(),
        object: OPENAI_COMPAT.OBJECT_CHUNK,
        created: Math.floor(Date.now() / LIMIT.MS_PER_SECOND),
        model: modelId,
        choices: [
          {
            index: 0,
            delta: { content: text },
            finish_reason: null,
          },
        ],
      };
      envelopes.push(openai);
    }
  }

  return envelopes;
}

/**
 * Create a finish envelope (OpenAI style) for end of stream. Call once when prompt completes.
 */
export function createOpenAIFinishEnvelope(options: {
  modelId?: string;
  finishReason?: string;
}): OpenAIStyleChunkEnvelope {
  const {
    modelId = OPENAI_COMPAT.DEFAULT_MODEL_ID,
    finishReason = OPENAI_COMPAT.FINISH_REASON_STOP,
  } = options;
  return {
    id: crypto.randomUUID(),
    object: OPENAI_COMPAT.OBJECT_CHUNK,
    created: Math.floor(Date.now() / LIMIT.MS_PER_SECOND),
    model: modelId,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
  };
}
