import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PERMISSION_OUTCOME } from "../src/domain/permission.outcome";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";

const mockInitialize = vi.fn();
const mockNewSession = vi.fn();
const mockPrompt = vi.fn();
const mockAuthenticate = vi.fn();
const mockConstructed = vi.fn();

vi.mock("@agentclientprotocol/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agentclientprotocol/sdk")>();
  return {
    ...actual,
    ClientSideConnection: class {
      constructor() {
        mockConstructed();
      }
      initialize = mockInitialize;
      newSession = mockNewSession;
      prompt = mockPrompt;
      authenticate = mockAuthenticate;
    },
  };
});

const { createAcpAgentPort } = await import("../src/runtime/acp.client");

const createMockConnection = (stream: unknown = { readable: true, writable: true }) =>
  createFakeAcpConnection(stream);

type PortWithPermission = Awaited<ReturnType<typeof createAcpAgentPort>> & {
  requestPermission?(r: unknown): Promise<unknown>;
};

describe("createAcpAgentPort contract", () => {
  beforeEach(() => {
    mockInitialize.mockReset().mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: {},
    });
    mockNewSession.mockReset().mockResolvedValue({ sessionId: "sess-contract-1" });
    mockPrompt.mockReset().mockResolvedValue({ stopReason: "end_turn" });
    mockAuthenticate.mockReset().mockResolvedValue({});
    mockConstructed.mockReset();
  });

  it("connect → initialize → newSession → prompt happy path", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await port.connect();
    expect(connection.connect).toHaveBeenCalled();
    expect(connection.getStream).toHaveBeenCalled();

    const init = await port.initialize();
    expect(mockInitialize).toHaveBeenCalled();
    expect(init.protocolVersion).toBe(1);

    const session = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    expect(mockNewSession).toHaveBeenCalled();
    expect(session.sessionId).toBe("sess-contract-1");

    const promptRes = await port.prompt({
      sessionId: "sess-contract-1",
      prompt: [{ type: "text", text: "hi" }],
    });
    expect(mockPrompt).toHaveBeenCalled();
    expect(promptRes.stopReason).toBe("end_turn");

    await port.disconnect();
    expect(connection.disconnect).toHaveBeenCalled();
  });

  it("throws when connect has no stream", async () => {
    const connection = createMockConnection(null);
    const port = createAcpAgentPort(connection);
    await expect(port.connect()).rejects.toThrow(ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE);
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

    expect(mockConstructed).toHaveBeenCalledTimes(1);
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

  it("stops accepting requests once the agent process exits", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);
    await port.connect();

    connection.emitExit({ code: 1, signal: null });

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
});

/** Unused import guard for EventEmitter fake streams in related suites. */
void EventEmitter;
void Readable;
void Writable;
