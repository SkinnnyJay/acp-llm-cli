import { RequestError } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { AcpCliError, AgentProtocolError, ConnectionError } from "../src/domain/errors";
import { wrapAgentPortWithStream } from "../src/runtime/acp.agent.port.stream";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import type { IAgentPort } from "../src/runtime/agent.port";
import { createFakeAcpAgent, type FakeAcpAgent, type JsonMessage } from "./helpers/fake.acp.agent";
import { createFakeAcpConnection, type FakeAcpConnection } from "./helpers/fake.acp.connection";

/**
 * Errors the agent returns over JSON-RPC, through the real SDK. The client turns each SDK
 * RequestError into an AgentProtocolError; anything else passes through untouched.
 */

const AUTH_METHODS = [
  { id: "chatgpt", name: "Log in with ChatGPT", description: "Browser sign-in" },
  { id: "api-key", name: "Use an API key", description: "Reads OPENAI_API_KEY" },
];
const promptParams = { sessionId: "s1", prompt: [{ type: "text" as const, text: "hi" }] };
const newSessionParams = { cwd: "/tmp", mcpServers: [] };

type Failure = { code: number; message: string; data?: unknown };

/** An agent that advertises AUTH_METHODS and fails the named methods with `failure`. */
function scriptedAgent(failing: Record<string, Failure | undefined>): FakeAcpAgent {
  return createFakeAcpAgent("separate-writes", undefined, (request: JsonMessage) => {
    const failure = failing[request.method as string];
    if (failure) return [{ jsonrpc: "2.0", id: request.id, error: failure }];
    if (request.method === "initialize") {
      return [
        {
          jsonrpc: "2.0",
          id: request.id,
          result: { protocolVersion: 1, agentCapabilities: {}, authMethods: AUTH_METHODS },
        },
      ];
    }
    if (request.method === "session/new") {
      return [{ jsonrpc: "2.0", id: request.id, result: { sessionId: "s1" } }];
    }
    return undefined;
  });
}

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error
  );

describe("ACPClient classifies agent JSON-RPC errors", () => {
  let agent: FakeAcpAgent | undefined;
  let port: IAgentPort | undefined;
  let connection: FakeAcpConnection | undefined;
  const extraAgents: FakeAcpAgent[] = [];

  const start = async (failing: Record<string, Failure | undefined>, providerId = "codex-cli") => {
    agent = scriptedAgent(failing);
    connection = createFakeAcpConnection(agent.stream);
    port = createAcpAgentPort(connection, { providerId });
    await port.connect();
    return port;
  };

  afterEach(async () => {
    await port?.disconnect().catch(() => undefined);
    port = undefined;
    connection = undefined;
    await agent?.close();
    agent = undefined;
    await Promise.all(extraAgents.splice(0).map((extra) => extra.close()));
  });

  const authFailure = { code: -32000, message: "Authentication required" };

  it("session/new answered with -32000 rejects with AUTH_REQUIRED and the advertised methods", async () => {
    const p = await start({ "session/new": authFailure });
    await p.initialize();

    const error = await rejectionOf(p.newSession(newSessionParams));

    expect(error).toBeInstanceOf(AgentProtocolError);
    const typed = error as AgentProtocolError;
    expect(typed.code).toBe("AUTH_REQUIRED");
    expect(typed.rpcCode).toBe(-32000);
    expect(typed.authMethods).toEqual(AUTH_METHODS);
    expect(typed.providerId).toBe("codex-cli");
    expect(typed.hint).toContain("codex login");
    expect(typed.message).toContain("Authentication required");
    expect(typed.message).toContain("codex login");
    expect(typed.cause).toBeInstanceOf(RequestError);
    expect((typed.cause as RequestError).code).toBe(-32000);
  });

  it("session/prompt answered with -32000 rejects the same way, with the session id", async () => {
    const p = await start({ "session/prompt": authFailure });
    await p.initialize();

    const error = (await rejectionOf(p.prompt(promptParams))) as AgentProtocolError;

    expect(error).toBeInstanceOf(AgentProtocolError);
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.authMethods).toEqual(AUTH_METHODS);
    expect(error.sessionId).toBe("s1");
    expect(error.message).toContain("codex login");
  });

  it("authenticate() answered with -32000 is classified too", async () => {
    const p = await start({ authenticate: authFailure });
    await p.initialize();

    const error = (await rejectionOf(
      p.authenticate({ methodId: "chatgpt" })
    )) as AgentProtocolError;

    expect(error).toBeInstanceOf(AgentProtocolError);
    expect(error.code).toBe("AUTH_REQUIRED");
  });

  it("-32000 before any initialize() succeeded carries no auth methods", async () => {
    const p = await start({ "session/new": authFailure });

    const error = (await rejectionOf(p.newSession(newSessionParams))) as AgentProtocolError;

    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.authMethods).toEqual([]);
  });

  it("a provider not in PROVIDER_SETUP gets no hint and the agent's message unchanged", async () => {
    const p = await start({ "session/new": authFailure }, "my-custom-agent");
    await p.initialize();

    const error = (await rejectionOf(p.newSession(newSessionParams))) as AgentProtocolError;

    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.providerId).toBe("my-custom-agent");
    expect(error.hint).toBeUndefined();
    expect(error.message).toBe("Authentication required");
  });

  it("forgets the advertised auth methods when a new link is attached", async () => {
    const p = await start({ "session/new": authFailure });
    await p.initialize();
    const next = scriptedAgent({ "session/new": authFailure });
    extraAgents.push(next);
    await p.disconnect();
    connection?.getStream.mockReturnValue(next.stream);
    await p.connect();

    const error = (await rejectionOf(p.newSession(newSessionParams))) as AgentProtocolError;

    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.authMethods).toEqual([]);
  });

  it("does not double the period when the agent's message ends with one", async () => {
    const p = await start({ "session/new": { code: -32000, message: "Auth required." } });

    const error = (await rejectionOf(p.newSession(newSessionParams))) as AgentProtocolError;

    expect(error.message).toBe("Auth required. Sign in with: codex login");
    expect(ERROR_MESSAGE.WITH_HINT("No dot", "Hint")).toBe("No dot. Hint");
  });

  it("streamPrompt() delivers the same AgentProtocolError, not a re-wrapped Error", async () => {
    agent = scriptedAgent({ "session/prompt": authFailure });
    port = wrapAgentPortWithStream(
      createAcpAgentPort(createFakeAcpConnection(agent.stream), { providerId: "codex-cli" })
    );
    await port.connect();
    await port.initialize();

    const consume = async () => {
      for await (const _envelope of port?.streamPrompt?.(promptParams) ?? []) {
        // drain
      }
    };
    const error = (await rejectionOf(consume())) as AgentProtocolError;

    expect(error).toBeInstanceOf(AgentProtocolError);
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.authMethods).toEqual(AUTH_METHODS);
    expect(error.cause).toBeInstanceOf(RequestError);
  });

  it("the link stays usable after an auth error", async () => {
    const p = await start({ "session/new": authFailure });
    await p.initialize();
    await rejectionOf(p.newSession(newSessionParams));

    await expect(p.prompt(promptParams)).resolves.toEqual({ stopReason: "end_turn" });
  });

  it.each([
    { rpcCode: -32000, code: "AUTH_REQUIRED" },
    { rpcCode: -32002, code: "SESSION_NOT_FOUND" },
    { rpcCode: -32800, code: "REQUEST_CANCELLED" },
    { rpcCode: -32602, code: "INVALID_PARAMS" },
    { rpcCode: -32601, code: "METHOD_NOT_FOUND" },
    { rpcCode: -32022, code: "UNSUPPORTED_PROTOCOL_VERSION" },
    { rpcCode: -32603, code: "AGENT_INTERNAL_ERROR" },
    { rpcCode: -32099, code: "AGENT_INTERNAL_ERROR" },
  ])("JSON-RPC $rpcCode maps to $code", async ({ rpcCode, code }) => {
    const data = { sessionId: "s1", detail: rpcCode };
    const message = `agent says ${rpcCode}`;
    const p = await start({ "session/prompt": { code: rpcCode, message, data } }, "x-custom");
    await p.initialize();

    const error = (await rejectionOf(p.prompt(promptParams))) as AgentProtocolError;

    expect(error).toBeInstanceOf(AgentProtocolError);
    expect(error.code).toBe(code);
    expect(error.subsystem).toBe("protocol");
    expect(error.rpcCode).toBe(rpcCode);
    expect(error.data).toEqual(data);
    expect(error.message).toBe(message);
    expect(error.sessionId).toBe("s1");
    expect(error.providerId).toBe("x-custom");
    expect(error.cause).toBeInstanceOf(RequestError);
  });

  it("a request pending when the link closes rejects with ConnectionError LINK_CLOSED", async () => {
    agent = createFakeAcpAgent("separate-writes", () => []);
    port = createAcpAgentPort(createFakeAcpConnection(agent.stream), { providerId: "codex-cli" });
    await port.connect();
    await port.initialize();

    const pending = rejectionOf(port.prompt(promptParams));
    await agent.endOutput();
    const error = await pending;

    expect(error).not.toBeInstanceOf(AgentProtocolError);
    expect(error).toBeInstanceOf(ConnectionError);
    const typed = error as ConnectionError;
    expect(typed.code).toBe("LINK_CLOSED");
    expect(typed.sessionId).toBe("s1");
    expect(typed.cause).toBeInstanceOf(Error);
    expect(typed.cause).not.toBeInstanceOf(AcpCliError);
    expect(typed.message).toBe((typed.cause as Error).message);
  });
});
