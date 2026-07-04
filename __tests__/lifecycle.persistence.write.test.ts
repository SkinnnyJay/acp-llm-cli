import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { wrapAgentPortWithLifecycle } from "../src/runtime/lifecycle.supervisor";
import type { IAgentPort } from "../src/runtime/agent.port";

const createInnerPort = (): IAgentPort => {
  const port = new EventEmitter() as unknown as IAgentPort;
  Object.assign(port, {
    connectionStatus: "connected",
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue({}),
    newSession: vi.fn().mockResolvedValue({ sessionId: "sess-1" }),
    prompt: vi.fn(),
    authenticate: vi.fn(),
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
  });
  return port;
};

const notification = (sessionId: string) =>
  ({ sessionId, update: { sessionUpdate: "agent_message_chunk" } }) as never;

describe("wrapAgentPortWithLifecycle persistence writes", () => {
  it("persists once per session, not once per streamed chunk", async () => {
    // Every ACP session notification carries sessionId, so the frozen wrapper
    // awaited a persistence write for EVERY streamed chunk of every answer.
    const saveSession = vi.fn().mockResolvedValue(undefined);
    const persistence = {
      saveSession,
      loadSession: vi.fn().mockResolvedValue(null),
      clearSession: vi.fn().mockResolvedValue(undefined),
    };
    const wrapped = wrapAgentPortWithLifecycle(createInnerPort(), {
      providerId: "claude",
      sessionPersistence: persistence as never,
    });

    await wrapped.newSession({ cwd: "/", mcpServers: [] } as never);
    for (let i = 0; i < 100; i++) {
      await wrapped.sessionUpdate(notification("sess-1"));
    }
    expect(saveSession).toHaveBeenCalledTimes(1);

    // A different session id IS a change and gets persisted.
    await wrapped.sessionUpdate(notification("sess-2"));
    expect(saveSession).toHaveBeenCalledTimes(2);
  });

  it("forwards cancel from the lifecycle wrapper to the inner port", async () => {
    const inner = createInnerPort();
    const cancel = vi.fn().mockResolvedValue(undefined);
    Object.assign(inner, { cancel });
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "claude" });
    await wrapped.cancel?.({ sessionId: "s1" } as never);
    expect(cancel).toHaveBeenCalledWith({ sessionId: "s1" });
  });
});
