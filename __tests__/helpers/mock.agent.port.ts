import { EventEmitter } from "eventemitter3";
import { vi } from "vitest";
import type { ConnectionStatus } from "../../src/domain/connection.status";
import { CONNECTION_STATUS } from "../../src/domain/connection.status";
import type { IAgentPort } from "../../src/runtime/agent.port";

export interface MockAgentPortOptions {
  sessionId?: string;
  withRestart?: boolean;
}

/** Shared mock IAgentPort for decorator / factory composition tests. */
export function createMockAgentPort(options: MockAgentPortOptions = {}): IAgentPort {
  const emitter = new EventEmitter();
  let status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;
  const sessionId = options.sessionId ?? "sess-1";

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
    newSession: vi.fn().mockResolvedValue({ sessionId }),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    authenticate: vi.fn().mockResolvedValue({}),
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    addListener: emitter.addListener.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
    listeners: emitter.listeners.bind(emitter),
    listenerCount: emitter.listenerCount.bind(emitter),
    eventNames: emitter.eventNames.bind(emitter),
    once: emitter.once.bind(emitter),
  };

  if (options.withRestart) {
    // Stub only — callers that need disconnect/connect semantics should assert those separately.
    Object.assign(port, {
      restart: vi.fn().mockResolvedValue(undefined),
    });
  }

  return port as unknown as IAgentPort;
}
