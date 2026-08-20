import { describe, expect, it } from "vitest";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import { createAcpCliHarnessRuntime } from "../src/providers/acp.shared";
import type { IAgentPort } from "../src/runtime/agent.port";
import { wrapAgentPortWithLifecycle } from "../src/runtime/lifecycle.supervisor";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";
import { createMockAgentPort } from "./helpers/mock.agent.port";

const createMockPort = (sessionId = "sess-default") => createMockAgentPort({ sessionId });

describe("createMemorySessionPersistence", () => {
  it("clearSession removes a previously saved session", async () => {
    const persistence = createMemorySessionPersistence();
    await persistence.saveSession({
      providerId: "p1",
      workspace: "/w",
      sessionId: "s1",
      updatedAt: Date.now(),
    });
    expect(await persistence.loadSession("p1", "/w")).not.toBeNull();
    await persistence.clearSession("p1", "/w");
    expect(await persistence.loadSession("p1", "/w")).toBeNull();
  });

  it("assigns updatedAt when saveSession omits it", async () => {
    const persistence = createMemorySessionPersistence();
    const before = Date.now();
    await persistence.saveSession({
      providerId: "p2",
      sessionId: "s2",
    } as Parameters<typeof persistence.saveSession>[0]);
    const loaded = await persistence.loadSession("p2");
    expect(loaded?.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("Session persistence key isolation", () => {
  it("stores sessions under distinct keys per provider", async () => {
    const persistence = createMemorySessionPersistence();

    const claudePort = createMockPort("claude-session-1");
    const wrappedClaude = wrapAgentPortWithLifecycle(claudePort, {
      persistence: { store: persistence, providerId: PROVIDER_IDS.CLAUDE_CLI_ID },
    });

    const geminiPort = createMockPort("gemini-session-2");
    const wrappedGemini = wrapAgentPortWithLifecycle(geminiPort, {
      persistence: { store: persistence, providerId: PROVIDER_IDS.GEMINI_CLI_ID },
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
      persistence: {
        store: persistence,
        providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
        workspace: "/workspace/A",
      },
    });

    const portB = createMockPort("ws-session-B");
    const wrappedB = wrapAgentPortWithLifecycle(portB, {
      persistence: {
        store: persistence,
        providerId: PROVIDER_IDS.CLAUDE_CLI_ID,
        workspace: "/workspace/B",
      },
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
        { sessionPersistence: createMemorySessionPersistence() }
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
