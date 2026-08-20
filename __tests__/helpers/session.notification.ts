import type { SessionNotification } from "@agentclientprotocol/sdk";

/**
 * Minimal valid SessionNotification fixtures.
 *
 * The SDK's SessionUpdate is a discriminated union whose members carry required
 * payloads, so `{ sessionUpdate: "agent_message_chunk" }` alone does not type.
 * Tests that only care about queue ordering or fan-out should not have to
 * restate the payload, so these build the smallest valid shape.
 */
export function agentMessageChunk(sessionId = "s1", text = "chunk"): SessionNotification {
  return {
    sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  };
}

export function toolCall(sessionId = "s1", toolCallId = "tc-1"): SessionNotification {
  return {
    sessionId,
    update: {
      sessionUpdate: "tool_call",
      toolCallId,
      title: "run",
      kind: "execute",
      status: "pending",
    },
  };
}
