import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import { createAcpCliHarnessRuntime } from "../src/providers/acp.shared";
import type { IAgentPort } from "../src/runtime/agent.port";
import { wrapAgentPortWithLifecycle } from "../src/runtime/lifecycle.supervisor";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";

function createMockPort(sessionId = "sess-default"): IAgentPort {
  const emitter = new EventEmitter();
  return {
    get connectionStatus() {
      return CONNECTION_STATUS.DISCONNECTED;
    },
    capabilities: {},
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue({ protocolVersion: "1" }),
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
  } as unknown as IAgentPort;
}

describe("Session persistence key isolation", () => {
  it("stores sessions under distinct keys per provider", async () => {
    const persistence = createMemorySessionPersistence();

    const claudePort = createMockPort("claude-session-1");
    const wrappedClaude = wrapAgentPortWithLifecycle(claudePort, {
      sessionPersistence: persistence,
      providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
    });

    const geminiPort = createMockPort("gemini-session-2");
    const wrappedGemini = wrapAgentPortWithLifecycle(geminiPort, {
      sessionPersistence: persistence,
      providerId: PROVIDER_IDS.GEMINI_CLI_ID,
    });

    await wrappedClaude.newSession({ cwd: "/tmp", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);
    await wrappedGemini.newSession({ cwd: "/tmp", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);

    const claudeSession = await persistence.loadSession(PROVIDER_IDS.CLAUDE_CLI_ID);
    const geminiSession = await persistence.loadSession(PROVIDER_IDS.GEMINI_CLI_ID);

    expect(claudeSession?.sessionId).toBe("claude-session-1");
    expect(geminiSession?.sessionId).toBe("gemini-session-2");
    expect(claudeSession?.sessionId).not.toBe(geminiSession?.sessionId);
  });

  it("isolates sessions when workspace is also provided", async () => {
    const persistence = createMemorySessionPersistence();

    const port = createMockPort("ws-session");
    const wrapped = wrapAgentPortWithLifecycle(port, {
      sessionPersistence: persistence,
      providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
      workspace: "/workspace/A",
    });

    const portB = createMockPort("ws-session-B");
    const wrappedB = wrapAgentPortWithLifecycle(portB, {
      sessionPersistence: persistence,
      providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
      workspace: "/workspace/B",
    });

    await wrapped.newSession({ cwd: "/workspace/A", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);
    await wrappedB.newSession({ cwd: "/workspace/B", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);

    const sessA = await persistence.loadSession(PROVIDER_IDS.CLAUDE_CLI_ID, "/workspace/A");
    const sessB = await persistence.loadSession(PROVIDER_IDS.CLAUDE_CLI_ID, "/workspace/B");

    expect(sessA?.sessionId).toBe("ws-session");
    expect(sessB?.sessionId).toBe("ws-session-B");
    expect(sessA?.sessionId).not.toBe(sessB?.sessionId);
  });
});

describe("createAcpCliHarnessRuntime sessionPersistence guard", () => {
  it("throws when sessionPersistence is provided without providerId", () => {
    expect(() =>
      createAcpCliHarnessRuntime(
        { command: "claude-code-acp", args: [], env: {} },
        {
          sessionPersistence: createMemorySessionPersistence(),
        }
      )
    ).toThrow(ERROR_MESSAGE.SESSION_PERSISTENCE_PROVIDER_ID_REQUIRED);
  });

  it("does not throw when providerId is provided with sessionPersistence", () => {
    expect(() =>
      createAcpCliHarnessRuntime(
        { command: "claude-code-acp", args: [], env: {} },
        {
          sessionPersistence: createMemorySessionPersistence(),
          providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
        }
      )
    ).not.toThrow();
  });

  it("does not throw when neither sessionPersistence nor providerId are provided", () => {
    expect(() =>
      createAcpCliHarnessRuntime({ command: "claude-code-acp", args: [], env: {} })
    ).not.toThrow();
  });
});
