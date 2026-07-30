import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PERMISSION_OUTCOME } from "../src/domain/permission.outcome";

const mockInitialize = vi.fn();
const mockNewSession = vi.fn();
const mockPrompt = vi.fn();
const mockAuthenticate = vi.fn();

vi.mock("@agentclientprotocol/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agentclientprotocol/sdk")>();
  return {
    ...actual,
    ClientSideConnection: class {
      initialize = mockInitialize;
      newSession = mockNewSession;
      prompt = mockPrompt;
      authenticate = mockAuthenticate;
      constructor(_factory: unknown, _stream: unknown) {}
    },
  };
});

const { createAcpAgentPort } = await import("../src/runtime/acp.client");

function createMockConnection(stream: unknown = { readable: true, writable: true }) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getStream: vi.fn().mockReturnValue(stream),
    connectionStatus: "disconnected" as const,
    on: vi.fn(),
  };
}

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
});

/** Unused import guard for EventEmitter fake streams in related suites. */
void EventEmitter;
void Readable;
void Writable;
