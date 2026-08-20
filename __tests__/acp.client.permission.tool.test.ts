import { describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";

const createMockConnection = () => createFakeAcpConnection(null);

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
    const handler = vi
      .fn()
      .mockResolvedValue({ outcome: { outcome: "selected" as const, optionId: "deny" } });
    const port = createAcpAgentPort(connection, { permissionHandler: handler });

    const request = {
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "allow", kind: "allow_once", name: "Allow" },
        { optionId: "deny", kind: "reject_once", name: "Deny" },
      ],
    };

    const result = await (port as PortWithClient).requestPermission?.(request);

    expect(handler).toHaveBeenCalledWith(request);
    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "deny" } });
  });

  it("emits permissionRequest then cancels when no handler (safe default)", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    const request = {
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1", title: "run", kind: "execute", rawInput: {} },
      options: [
        { optionId: "allow", kind: "allow_once", name: "Allow" },
        { optionId: "deny", kind: "reject_once", name: "Deny" },
      ],
    };

    const emitted: unknown[] = [];
    port.on("permissionRequest", (r) => emitted.push(r));

    const result = await (port as PortWithClient).requestPermission?.(request);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(request);
    expect(result).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("returns cancelled when no handler and no options", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    const result = await (port as PortWithClient).requestPermission?.({
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
      (port as PortWithClient).readTextFile?.({ path: "/tmp/foo", offset: 0, length: 100 })
    ).rejects.toThrow(ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED);
  });

  it("writeTextFile throws when toolHost not configured", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await expect(
      (port as PortWithClient).writeTextFile?.({ path: "/tmp/foo", content: "x" })
    ).rejects.toThrow(ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED);
  });

  it("createTerminal throws when toolHost not configured", async () => {
    const connection = createMockConnection();
    const port = createAcpAgentPort(connection);

    await expect(
      (port as PortWithClient).createTerminal?.({ command: "bash", args: [], env: {} })
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
    const result = await (port as PortWithClient).readTextFile?.(params);

    expect(readTextFile).toHaveBeenCalledWith(params);
    expect(result).toEqual({ content: "file content" });
  });
});
