import { afterEach, describe, expect, it } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import type { IAgentPort } from "../src/runtime/agent.port";
import { createFakeAcpAgent, type FakeAcpAgent } from "./helpers/fake.acp.agent";
import { createFakeAcpConnection, type FakeAcpConnection } from "./helpers/fake.acp.connection";

/**
 * The SDK closes a connection on its own when the agent's output ends, a write fails, or the
 * input errors. The transport stays the only source of truth for process exits, so the client
 * reports nothing at that moment: it drops the dead link, fails calls with a message that says
 * what happened, and rebuilds the transport on the next connect() if the process is still there.
 */

/** Lets every pending close callback run, so "nothing happened" is a real observation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const promptParams = { sessionId: "s1", prompt: [{ type: "text" as const, text: "hi" }] };

describe("ACPClient when the SDK closes the link by itself", () => {
  const agents: FakeAcpAgent[] = [];
  let port: IAgentPort | undefined;

  const startAgent = () => {
    const agent = createFakeAcpAgent();
    agents.push(agent);
    return agent;
  };

  const connectedPort = async (): Promise<{
    port: IAgentPort;
    connection: FakeAcpConnection;
    agent: FakeAcpAgent;
    errors: Error[];
  }> => {
    const agent = startAgent();
    const connection = createFakeAcpConnection(agent.stream);
    connection.setStatus(CONNECTION_STATUS.CONNECTED);
    port = createAcpAgentPort(connection);
    const errors: Error[] = [];
    port.on("error", (error) => errors.push(error));
    await port.connect();
    await port.initialize();
    return { port, connection, agent, errors };
  };

  /** Ends the agent's output and waits until the client has dropped the dead link. */
  const endAgentOutput = async (p: IAgentPort, agent: FakeAcpAgent) => {
    await agent.endOutput();
    await expect
      .poll(() =>
        p.prompt(promptParams).then(
          () => "resolved",
          (error: Error) => error.message
        )
      )
      .toBe(ERROR_MESSAGE.ACP_LINK_CLOSED);
  };

  afterEach(async () => {
    await port?.disconnect().catch(() => undefined);
    port = undefined;
    await Promise.all(agents.splice(0).map((agent) => agent.close()));
  });

  it("an agent EOF leaves the transport alone, emits nothing, and names the cause on calls", async () => {
    const { port: p, connection, agent, errors } = await connectedPort();

    await endAgentOutput(p, agent);
    await settle();

    expect(errors).toEqual([]);
    expect(connection.disconnect).not.toHaveBeenCalled();
    await expect(p.initialize()).rejects.toThrow(ERROR_MESSAGE.ACP_LINK_CLOSED);
  });

  it("connect() rebuilds the transport when it still hands out the dead stream", async () => {
    const { port: p, connection, agent } = await connectedPort();
    await endAgentOutput(p, agent);

    const next = startAgent();
    // The process is still alive, so the transport keeps the old stream until it is restarted.
    connection.connect.mockImplementation(async () => {
      if (connection.disconnect.mock.calls.length > 0) {
        connection.getStream.mockReturnValue(next.stream);
      }
    });
    await p.connect();

    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    const disconnectOrder = connection.disconnect.mock.invocationCallOrder[0] ?? 0;
    const lastConnectOrder = connection.connect.mock.invocationCallOrder.at(-1) ?? 0;
    expect(disconnectOrder).toBeLessThan(lastConnectOrder);
    const init = await p.initialize();
    expect(init.protocolVersion).toBe(1);
    const response = await p.prompt(promptParams);
    expect(response.stopReason).toBe("end_turn");
  });

  it("connect() gives up with ACP_STREAM_UNAVAILABLE if the restart still yields the dead stream", async () => {
    const { port: p, connection, agent } = await connectedPort();
    await endAgentOutput(p, agent);

    await expect(p.connect()).rejects.toThrow(ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE);
    expect(connection.disconnect).toHaveBeenCalledTimes(2);
  });

  it("a later transport EXIT or terminal state reverts calls to not-connected", async () => {
    const { port: p, connection, agent, errors } = await connectedPort();
    await endAgentOutput(p, agent);

    connection.getStream.mockReturnValue(undefined);
    connection.emitExit({ code: 1, signal: null });
    await expect(p.prompt(promptParams)).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);

    connection.setStatus(CONNECTION_STATUS.ERROR);
    await settle();
    await expect(p.prompt(promptParams)).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
    expect(errors).toEqual([]);
  });

  it("disconnect() after an EOF clears the dead-link state", async () => {
    const { port: p, agent } = await connectedPort();
    await endAgentOutput(p, agent);

    await p.disconnect();

    await expect(p.prompt(promptParams)).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
  });

  it("a normal disconnect() emits no error and disconnects the transport once", async () => {
    const { port: p, connection, errors } = await connectedPort();

    await p.disconnect();
    await settle();

    expect(errors).toEqual([]);
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    await expect(p.prompt(promptParams)).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
  });

  it("a transport-driven detach emits no error from the close path", async () => {
    const { port: p, connection, errors } = await connectedPort();

    connection.setStatus(CONNECTION_STATUS.DISCONNECTED);
    await settle();

    expect(errors).toEqual([]);
    expect(connection.disconnect).not.toHaveBeenCalled();
    await expect(p.prompt(promptParams)).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
  });
});
