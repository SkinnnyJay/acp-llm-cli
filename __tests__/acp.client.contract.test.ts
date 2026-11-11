import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PERMISSION_OUTCOME } from "../src/domain/permission.outcome";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";
import { createFakeAcpSdk } from "./helpers/fake.acp.sdk";

const sdk = createFakeAcpSdk();

vi.mock("@agentclientprotocol/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agentclientprotocol/sdk")>();
  return { ...actual, client: sdk.client };
});

const { createAcpAgentPort } = await import("../src/runtime/acp.client");

const createMockConnection = (stream: unknown = { readable: true, writable: true }) =>
  createFakeAcpConnection(stream);

type PortWithPermission = Awaited<ReturnType<typeof createAcpAgentPort>> & {
  requestPermission?(r: unknown): Promise<unknown>;
};

describe("createAcpAgentPort contract", () => {
  beforeEach(() => {
    sdk.reset();
    sdk.responses.set("initialize", { protocolVersion: 1, agentCapabilities: {} });
    sdk.responses.set("session/new", { sessionId: "sess-contract-1" });
    sdk.responses.set("session/prompt", { stopReason: "end_turn" });
    sdk.responses.set("authenticate", {});
    sdk.responses.set("session/set_mode", {});
    sdk.responses.set("session/set_config_option", { configOptions: [] });
  });

  it("connect → initialize → newSession → prompt happy path", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await port.connect();
    expect(connection.connect).toHaveBeenCalled();
    expect(connection.getStream).toHaveBeenCalled();

    const init = await port.initialize();
    expect(sdk.request).toHaveBeenCalledWith("initialize", expect.anything());
    expect(init.protocolVersion).toBe(1);

    const session = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    expect(sdk.request).toHaveBeenCalledWith("session/new", expect.anything());
    expect(session.sessionId).toBe("sess-contract-1");

    const promptRes = await port.prompt({
      sessionId: "sess-contract-1",
      prompt: [{ type: "text", text: "hi" }],
    });
    expect(sdk.request).toHaveBeenCalledWith("session/prompt", expect.anything());
    expect(promptRes.stopReason).toBe("end_turn");

    await port.disconnect();
    expect(connection.disconnect).toHaveBeenCalled();
  });

  it("throws when connect has no stream", async () => {
    const connection = createMockConnection(null);
    const port = createAcpAgentPort(connection);
    await expect(port.connect()).rejects.toThrow(ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE);
    await expect(port.connect()).rejects.toMatchObject({
      name: "ConnectionError",
      code: "STREAM_UNAVAILABLE",
    });
  });

  it("throws when methods called before connect", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await expect(port.initialize()).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
  });

  it("default-denies permission requests when no handler", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection) as PortWithPermission;
    const emitted: unknown[] = [];
    port.on("permissionRequest", (r) => emitted.push(r));

    const result = await port.requestPermission?.({
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }],
    });

    expect(emitted).toHaveLength(1);
    expect(result).toEqual({ outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } });
  });

  it("invalid config fails before spawn via connection factory smoke", () => {
    // Construction itself does not spawn; connect does. Port is constructible.
    const connection = createMockConnection();
    expect(() => createAcpAgentPort(connection)).not.toThrow();
  });

  it("attaches one reader loop even when connect is called twice", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await port.connect();
    await port.connect();

    expect(sdk.connect).toHaveBeenCalledTimes(1);
  });

  it("stops accepting requests once the transport reports a terminal state", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();

    connection.setStatus(CONNECTION_STATUS.ERROR);

    await expect(port.prompt({ sessionId: "s1", prompt: [] } as never)).rejects.toThrow(
      ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED
    );
  });

  it("forwards transport state and error events to the port", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    const states: string[] = [];
    const errors: Error[] = [];
    port.on("state", (s) => states.push(s));
    port.on("error", (e) => errors.push(e));

    connection.setStatus(CONNECTION_STATUS.CONNECTED);
    connection.emitError(new Error("transport blew up"));

    expect(states).toEqual([CONNECTION_STATUS.CONNECTED]);
    expect(errors[0]?.message).toBe("transport blew up");
  });

  it("tears down the transport when the stream is unavailable", async () => {
    const connection = createMockConnection(null);
    const port = createAcpAgentPort(connection);

    await expect(port.connect()).rejects.toThrow(ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE);

    expect(connection.disconnect).toHaveBeenCalled();
  });

  it("does not stay usable when the transport disconnect rejects", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();
    connection.disconnect.mockRejectedValueOnce(new Error("kill failed"));

    await expect(port.disconnect()).rejects.toThrow("kill failed");
    await expect(port.prompt({ sessionId: "s1", prompt: [] } as never)).rejects.toThrow(
      ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED
    );
  });

  it("keeps the live link when a previously abandoned child finally exits", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();

    // A stale child's exit is still announced connection-wide, but it does not belong to the
    // stream this client is attached to.
    connection.emitExit({ code: null, signal: "SIGKILL" });

    await expect(port.prompt({ sessionId: "s1", prompt: [] } as never)).resolves.toBeDefined();
  });

  it("detaches when the child backing the attached stream exits", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();

    // The transport clears its stream before announcing the exit.
    connection.getStream.mockReturnValue(undefined);
    connection.emitExit({ code: 1, signal: null });

    await expect(port.prompt({ sessionId: "s1", prompt: [] } as never)).rejects.toThrow(
      ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED
    );
  });
});

/** Unused import guard for EventEmitter fake streams in related suites. */
void EventEmitter;
void Readable;
void Writable;

describe("createAcpAgentPort session methods", () => {
  beforeEach(() => {
    sdk.reset();
    sdk.responses.set("initialize", { protocolVersion: 1, agentCapabilities: {} });
    sdk.responses.set("session/new", { sessionId: "sess-contract-1" });
    sdk.responses.set("session/prompt", { stopReason: "end_turn" });
    sdk.responses.set("authenticate", {});
    sdk.responses.set("session/set_mode", {});
    sdk.responses.set("session/set_config_option", { configOptions: [] });
  });

  const connected = async () => {
    const port = createAcpAgentPort(createMockConnection());
    await port.connect();
    return port;
  };

  it("delegates authenticate to the connection", async () => {
    const port = await connected();
    const params = { methodId: "api-key" };
    await port.authenticate(params);
    expect(sdk.request).toHaveBeenCalledWith("authenticate", params);
  });

  it("delegates setSessionMode to the connection", async () => {
    const port = await connected();
    const params = { sessionId: "s1", modeId: "read-only" };
    await port.setSessionMode?.(params);
    expect(sdk.request).toHaveBeenCalledWith("session/set_mode", params);
    expect(sdk.request).not.toHaveBeenCalledWith("session/set_config_option", expect.anything());
  });

  // ACP 1.x replaced the removed session/set_model with the general
  // session/set_config_option. Mode and model are sibling categories, so a
  // config-option call must never be routed at setSessionMode.
  it("delegates setSessionConfigOption to the connection, not setSessionMode", async () => {
    const port = await connected();
    const params = { sessionId: "s1", configId: "model", value: "claude-sonnet-4.6" };
    sdk.responses.set("session/set_config_option", {
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "claude-sonnet-4.6",
          options: [],
        },
      ],
    });

    const result = await port.setSessionConfigOption?.(params);

    expect(sdk.request).toHaveBeenCalledWith("session/set_config_option", params);
    expect(sdk.request).not.toHaveBeenCalledWith("session/set_mode", expect.anything());
    expect(result?.configOptions[0]?.currentValue).toBe("claude-sonnet-4.6");
  });

  it("re-emits an inbound sessionUpdate on the port", async () => {
    const port = await connected();
    const seen: unknown[] = [];
    port.on("sessionUpdate", (u) => seen.push(u));

    const update = {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk" as const,
        content: { type: "text" as const, text: "hi" },
      },
    };
    await port.sessionUpdate(update);

    expect(seen).toEqual([update]);
  });

  it("routes an agent-sent session/update notification to the port's sessionUpdate event", async () => {
    const note = {
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } },
    };
    const message = { jsonrpc: "2.0", method: "session/update", params: note };
    const transportStream = {
      readable: new ReadableStream({
        start(controller) {
          controller.enqueue(message);
          controller.close();
        },
      }),
      writable: new WritableStream(),
    };
    const port = createAcpAgentPort(createMockConnection(transportStream));
    await port.connect();
    const seen: unknown[] = [];
    port.on("sessionUpdate", (u) => seen.push(u));

    // The update is emitted as the SDK reads it from the stream it was given, and passed on.
    const sdkStream = sdk.connect.mock.calls[0]?.[0] as typeof transportStream;
    const reader = sdkStream.readable.getReader();
    const read = await reader.read();
    await reader.cancel();

    expect(read.value).toBe(message);
    expect(seen).toEqual([note]);
  });

  it("answers an agent-sent permission request with cancelled when no handler is set", async () => {
    const port = createAcpAgentPort(createMockConnection());
    await port.connect();
    const result = await sdk.callRequest("session/request_permission", {
      sessionId: "s1",
      toolCall: { toolCallId: "t1" },
      options: [],
    });
    expect(result).toEqual({ outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } });
  });

  it("closes the SDK connection when the transport reports a terminal state", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();
    connection.setStatus(CONNECTION_STATUS.DISCONNECTED);
    expect(sdk.close).toHaveBeenCalledTimes(1);
  });

  it("rejects session methods before connect", async () => {
    const port = createAcpAgentPort(createMockConnection());
    await expect(
      port.setSessionConfigOption?.({ sessionId: "s1", configId: "model", value: "x" })
    ).rejects.toThrow(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
  });
});

describe("ACPClient capability advertisement", () => {
  const stubToolHost = {
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    createTerminal: vi.fn(),
    terminalOutput: vi.fn(),
    waitForTerminalExit: vi.fn(),
    releaseTerminal: vi.fn(),
    killTerminal: vi.fn(),
  } as never;

  it("advertises fs and terminal when a toolHost is supplied", async () => {
    // Without this the client sent clientCapabilities: {}, so a conforming agent never issued
    // fs/* or terminal/* requests and the supplied tool host was silently unreachable.
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection, { toolHost: stubToolHost });
    await port.connect();
    await port.initialize();

    expect(sdk.request).toHaveBeenCalledWith(
      "initialize",
      expect.objectContaining({
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      })
    );
  });

  it("advertises nothing when no toolHost is supplied", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();
    await port.initialize();

    expect(sdk.request).toHaveBeenCalledWith(
      "initialize",
      expect.objectContaining({ clientCapabilities: {} })
    );
  });

  it("lets an explicit clientCapabilities win over the derived default", async () => {
    // The escape hatch must stay total: session/plan and partial fs are only expressible here,
    // so an explicit value is never merged with the derived one.
    const connection = createMockConnection();
    const explicit = { fs: { readTextFile: true } };
    const port = createAcpAgentPort(connection, {
      toolHost: stubToolHost,
      clientCapabilities: explicit,
    });
    await port.connect();
    await port.initialize();

    expect(sdk.request).toHaveBeenCalledWith(
      "initialize",
      expect.objectContaining({ clientCapabilities: explicit })
    );
  });
});
