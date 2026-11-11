import type { AgentCapabilities, SessionNotification } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProtocolError } from "../src/domain/errors";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import type { IAgentPort } from "../src/runtime/agent.port";
import { createFakeAcpAgent, type FakeAcpAgent, type JsonMessage } from "./helpers/fake.acp.agent";
import { createFakeAcpConnection, type FakeAcpConnection } from "./helpers/fake.acp.connection";

/**
 * `session/resume`, `session/load` and the capabilities that advertise them, through the real SDK
 * over ndJsonStream with a scripted agent on the far end.
 */

const CAPS: AgentCapabilities = { loadSession: true, sessionCapabilities: { resume: {} } };
const SESSION_ID = "s-old";
const restoreParams = { sessionId: SESSION_ID, cwd: "/tmp", mcpServers: [] };

/** An agent that advertises CAPS and answers the named methods with the given error. */
function scriptedAgent(failing: Record<string, { code: number; message: string }> = {}) {
  return createFakeAcpAgent("separate-writes", undefined, (request: JsonMessage) => {
    const failure = failing[request.method as string];
    if (failure) return [{ jsonrpc: "2.0", id: request.id, error: failure }];
    if (request.method === "initialize") {
      return [
        {
          jsonrpc: "2.0",
          id: request.id,
          result: { protocolVersion: 1, agentCapabilities: CAPS },
        },
      ];
    }
    return undefined;
  });
}

describe("ACPClient session restore", () => {
  const agents: FakeAcpAgent[] = [];
  let port: IAgentPort | undefined;
  let connection: FakeAcpConnection | undefined;

  const start = async (failing?: Record<string, { code: number; message: string }>) => {
    const agent = scriptedAgent(failing);
    agents.push(agent);
    connection = createFakeAcpConnection(agent.stream);
    port = createAcpAgentPort(connection, { providerId: "claude-cli" });
    await port.connect();
    return port;
  };

  afterEach(async () => {
    await port?.disconnect().catch(() => undefined);
    port = undefined;
    connection = undefined;
    await Promise.all(agents.splice(0).map((agent) => agent.close()));
  });

  it("records agentCapabilities at initialize and forgets them when the link is replaced", async () => {
    const p = await start();
    expect(p.agentCapabilities).toBeUndefined();

    const init = await p.initialize();
    expect(p.agentCapabilities).toEqual(CAPS);
    expect(p.agentCapabilities).toEqual(init.agentCapabilities);

    const next = scriptedAgent();
    agents.push(next);
    await p.disconnect();
    connection?.getStream.mockReturnValue(next.stream);
    await p.connect();

    expect(p.agentCapabilities).toBeUndefined();
  });

  it("resumeSession sends session/resume and returns the response", async () => {
    const p = await start();
    await p.initialize();

    await expect(p.resumeSession?.(restoreParams)).resolves.toEqual({});
    expect(agents.at(0)?.received).toContain("session/resume");
  });

  it("loadSession delivers the replayed history as sessionUpdate events before it resolves", async () => {
    const p = await start();
    await p.initialize();
    const updates: SessionNotification[] = [];
    p.on("sessionUpdate", (update) => updates.push(update));

    const seenAtResolve = await p.loadSession?.(restoreParams).then((response) => {
      expect(response).toEqual({});
      return updates.length;
    });

    expect(agents.at(0)?.received).toContain("session/load");
    expect(seenAtResolve).toBe(2);
    expect(updates.map((u) => u.sessionId)).toEqual([SESSION_ID, SESSION_ID]);
  });

  it("an agent error on resumeSession surfaces as AgentProtocolError with the session id", async () => {
    const p = await start({ "session/resume": { code: -32002, message: "no such session" } });
    await p.initialize();

    const error = await p.resumeSession?.(restoreParams).then(
      () => undefined,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AgentProtocolError);
    expect(error).toMatchObject({ code: "SESSION_NOT_FOUND", sessionId: SESSION_ID });
  });
});
