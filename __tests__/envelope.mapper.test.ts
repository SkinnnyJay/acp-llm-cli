import { describe, expect, it } from "vitest";
import { ENVELOPE_MODE } from "../src/domain/envelope.mode";
import { isNativeEnvelope, isOpenAIEnvelope } from "../src/domain/stream.envelopes";
import {
  createOpenAIFinishEnvelope,
  sessionUpdateToEnvelopes,
} from "../src/runtime/envelope.mapper";

describe("sessionUpdateToEnvelopes", () => {
  it("emits native envelope when mode is NATIVE", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopes = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.NATIVE);
    expect(envelopes).toHaveLength(1);
    expect(isNativeEnvelope(envelopes[0])).toBe(true);
    expect((envelopes[0] as { kind: string; update: unknown }).update).toEqual(update);
  });

  it("emits native envelope when mode is BOTH", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hi" },
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopes = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.BOTH);
    expect(envelopes.length).toBeGreaterThanOrEqual(1);
    expect(envelopes.some(isNativeEnvelope)).toBe(true);
  });

  it("emits OpenAI-style envelope when mode is OPENAI and content has text", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "world" },
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopes = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.OPENAI);
    expect(envelopes).toHaveLength(1);
    expect(isOpenAIEnvelope(envelopes[0])).toBe(true);
    expect((envelopes[0] as { choices: unknown[] }).choices[0]).toMatchObject({
      delta: { content: "world" },
      finish_reason: null,
    });
  });

  it("emits both native and OpenAI when mode is BOTH and content has text", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "both" },
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopes = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.BOTH);
    expect(envelopes).toHaveLength(2);
    expect(envelopes.some(isNativeEnvelope)).toBe(true);
    expect(envelopes.some(isOpenAIEnvelope)).toBe(true);
  });

  it("uses custom modelId in OpenAI envelope", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "x" },
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopes = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.OPENAI, {
      modelId: "custom-model",
    });
    expect(envelopes[0]).toMatchObject({ model: "custom-model" });
  });

  it("emits native envelope for tool_call update (no OpenAI chunk)", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "run_terminal_cmd",
        status: "in_progress",
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopesNative = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.NATIVE);
    expect(envelopesNative).toHaveLength(1);
    expect(isNativeEnvelope(envelopesNative[0])).toBe(true);
    const envelopesOpenAI = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.OPENAI);
    expect(envelopesOpenAI).toHaveLength(0);
  });

  it("emits native envelope for agent_thought_chunk (no OpenAI chunk; only agent_message_chunk mapped)", () => {
    const update = {
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking" },
      },
    } as Parameters<typeof sessionUpdateToEnvelopes>[0];
    const envelopesNative = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.NATIVE);
    expect(envelopesNative).toHaveLength(1);
    expect(isNativeEnvelope(envelopesNative[0])).toBe(true);
    const envelopesOpenAI = sessionUpdateToEnvelopes(update, ENVELOPE_MODE.OPENAI);
    expect(envelopesOpenAI).toHaveLength(0);
  });
});

describe("createOpenAIFinishEnvelope", () => {
  it("creates finish envelope with default model and finishReason", () => {
    const env = createOpenAIFinishEnvelope({});
    expect(env.object).toBe("chat.completion.chunk");
    expect(env.model).toBe("acp-agent");
    expect(env.choices[0].finish_reason).toBe("stop");
  });

  it("creates finish envelope with custom options", () => {
    const env = createOpenAIFinishEnvelope({
      modelId: "gpt-4",
      finishReason: "length",
    });
    expect(env.model).toBe("gpt-4");
    expect(env.choices[0].finish_reason).toBe("length");
  });
});
