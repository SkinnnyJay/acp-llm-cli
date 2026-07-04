import { describe, expect, it, vi } from "vitest";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import { ERROR_MESSAGE } from "../src/domain/error.messages";

const createMockConnection = () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  getStream: vi.fn().mockReturnValue(null),
  connectionStatus: "disconnected" as const,
  on: vi.fn(),
});

/** ACPClient implements Client; IAgentPort type does not expose tool/permission methods. */
type PortWithClient = Awaited<ReturnType<typeof createAcpAgentPort>> & {
  requestPermission?(r: unknown): Promise<unknown>;
  readTextFile?(r: unknown): Promise<unknown>;
  writeTextFile?(r: unknown): Promise<unknown>;
  createTerminal?(r: unknown): Promise<unknown>;
};

describe("ACPClient permission handling", () => {
  it("uses permissionHandler when provided", async () => {
    const connection = createMockConnection();
    const handler = vi.fn().mockResolvedValue({ outcome: { outcome: "selected" as const, optionId: "deny" } });
    const port = createAcpAgentPort(connection, { permissionHandler: handler });

    const request = {
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "allow", kind: "allow_once", name: "Allow" },
        { optionId: "deny", kind: "reject_once", name: "Deny" },
      ],
    };

    const result = await (port as PortWithClient).requestPermission!(request);

    expect(handler).toHaveBeenCalledWith(request);
    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "deny" } });
  });

  // The frozen default selected options[0] whatever it was. The options array
  // is AGENT-controlled and real agents order allow_always first (see the ACP
  // session-modes example) — an unconfigured harness silently granted standing
  // approval for tool execution. Default is now fail-closed: prefer a
  // reject-kind option, else cancelled. The frozen behavior is available
  // explicitly via permissionMode: "first-option".
  it("emits permissionRequest then fails closed (reject option) when no handler", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    const request = {
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "always", kind: "allow_always", name: "Always allow" },
        { optionId: "allow", kind: "allow_once", name: "Allow" },
        { optionId: "deny", kind: "reject_once", name: "Deny" },
      ],
    };

    const emitted: unknown[] = [];
    port.on("permissionRequest", (r) => emitted.push(r));

    const result = await (port as PortWithClient).requestPermission!(request);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(request);
    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "deny" } });
  });

  it("fails closed to cancelled when only allow options are offered", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    const result = await (port as PortWithClient).requestPermission!({
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "always", kind: "allow_always", name: "Always allow" },
        { optionId: "allow", kind: "allow_once", name: "Allow" },
      ],
    });

    expect(result).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("prefers reject_once over reject_always when failing closed", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    const result = await (port as PortWithClient).requestPermission!({
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "never", kind: "reject_always", name: "Never" },
        { optionId: "deny", kind: "reject_once", name: "Deny" },
        { optionId: "allow", kind: "allow_once", name: "Allow" },
      ],
    });

    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "deny" } });
  });

  it('permissionMode: "first-option" restores the legacy behavior explicitly', async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection, { permissionMode: "first-option" });

    const result = await (port as PortWithClient).requestPermission!({
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "allow", kind: "allow_once", name: "Allow" },
        { optionId: "deny", kind: "reject_once", name: "Deny" },
      ],
    });

    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  });

  it("cancel(sessionId) answers a pending permission request with cancelled", async () => {
    const connection = createMockConnection();
    // Handler that never resolves — models a UI waiting on the user.
    let resolveHandler: ((r: unknown) => void) | undefined;
    const handler = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveHandler = resolve; })
    );
    const port = createAcpAgentPort(connection, {
      permissionHandler: handler as never,
    });

    const pending = (port as PortWithClient).requestPermission!({
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }],
    });

    // cancel() must answer the pending request with cancelled per spec, even
    // though the underlying connection is absent (throws) in this mock.
    const cancelable = port as PortWithClient & {
      cancel?(p: { sessionId: string }): Promise<void>;
    };
    await expect(cancelable.cancel!({ sessionId: "s1" })).rejects.toThrow();
    await expect(pending).resolves.toEqual({ outcome: { outcome: "cancelled" } });

    // A late handler answer must not double-settle or override cancelled.
    resolveHandler?.({ outcome: { outcome: "selected", optionId: "allow" } });
    await expect(pending).resolves.toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("returns cancelled when no handler and no options", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    const result = await (port as PortWithClient).requestPermission!({
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [],
    });

    expect(result).toEqual({ outcome: { outcome: "cancelled" } });
  });
});

describe("ACPClient tool host handling", () => {
  it("readTextFile throws when toolHost not configured", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await expect(
      (port as PortWithClient).readTextFile!({ path: "/tmp/foo", offset: 0, length: 100 })
    ).rejects.toThrow(
      ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED
    );
  });

  it("writeTextFile throws when toolHost not configured", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await expect((port as PortWithClient).writeTextFile!({ path: "/tmp/foo", content: "x" })).rejects.toThrow(
      ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED
    );
  });

  it("createTerminal throws when toolHost not configured", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await expect(
      (port as PortWithClient).createTerminal!({ command: "bash", args: [], env: {} })
    ).rejects.toThrow(ERROR_MESSAGE.TERMINAL_TOOLS_NOT_CONFIGURED);
  });

  it("delegates readTextFile to toolHost when configured", async () => {
    const connection = createMockConnection();
    const readTextFile = vi.fn().mockResolvedValue({ content: "file content" });
    const port = createAcpAgentPort(connection, {
      toolHost: {
        readTextFile,
        writeTextFile: vi.fn(),
        createTerminal: vi.fn(),
        terminalOutput: vi.fn(),
        waitForTerminalExit: vi.fn(),
        releaseTerminal: vi.fn(),
        killTerminal: vi.fn(),
      },
    });

    const params = { path: "/tmp/foo", offset: 0, length: 100 };
    const result = await (port as PortWithClient).readTextFile!(params);

    expect(readTextFile).toHaveBeenCalledWith(params);
    expect(result).toEqual({ content: "file content" });
  });
});
