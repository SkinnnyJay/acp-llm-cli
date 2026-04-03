import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import type { IAgentPort } from "../src/runtime/agent.port";
import { wrapAgentPortWithLifecycle } from "../src/runtime/lifecycle.supervisor";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { PORT_CAPABILITY } from "../src/domain/port.capabilities";

function createMockPort(): IAgentPort {
  const emitter = new EventEmitter();
  let status = CONNECTION_STATUS.DISCONNECTED;
  const port = {
    get connectionStatus() {
      return status;
    },
    connect: vi.fn().mockImplementation(async () => {
      status = CONNECTION_STATUS.CONNECTED;
      emitter.emit("state", status);
    }),
    disconnect: vi.fn().mockImplementation(async () => {
      status = CONNECTION_STATUS.DISCONNECTED;
      emitter.emit("state", status);
    }),
    initialize: vi.fn().mockResolvedValue({ protocolVersion: "1", agentCapabilities: {} }),
    newSession: vi.fn().mockResolvedValue({ sessionId: "sess-123" }),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    authenticate: vi.fn().mockResolvedValue({}),
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockImplementation(async () => {
      await port.disconnect();
      await port.connect();
      await port.initialize();
    }),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
  return port as unknown as IAgentPort;
}

describe("wrapAgentPortWithLifecycle", () => {
  it("adds restart, openClose, and sessionPersistence capabilities when persistence provided", () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "test-provider",
    });

    expect(wrapped.capabilities).toBeDefined();
    expect(wrapped.capabilities?.[PORT_CAPABILITY.RESTART]).toBe(true);
    expect(wrapped.capabilities?.[PORT_CAPABILITY.OPEN_CLOSE]).toBe(true);
    expect(wrapped.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(true);
  });

  it("sets sessionPersistence capability to false when no persistence", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      providerId: "test-provider",
    });

    expect(wrapped.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(false);
  });

  it("saves session when newSession returns sessionId", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "claude-cli",
    });

    await wrapped.newSession({ cwd: "/tmp", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);

    const loaded = await persistence.loadSession("claude-cli");
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe("sess-123");
  });

  it("delegates open to connect and close to disconnect", async () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });

    await wrapped.open?.();
    expect(inner.connect).toHaveBeenCalled();

    await wrapped.close?.();
    expect(inner.disconnect).toHaveBeenCalled();
  });
});
