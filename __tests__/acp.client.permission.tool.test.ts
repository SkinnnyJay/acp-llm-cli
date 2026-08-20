import { describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";

const createMockConnection = () => createFakeAcpConnection(null);

/** ACPClient implements Client; IAgentPort type does not expose tool/permission methods. */
type ToolHostMethod =
  | "readTextFile"
  | "writeTextFile"
  | "createTerminal"
  | "terminalOutput"
  | "waitForTerminalExit"
  | "releaseTerminal"
  | "killTerminal";

type PortWithClient = Awaited<ReturnType<typeof createAcpAgentPort>> & {
  requestPermission?(r: unknown): Promise<unknown>;
} & {
  [K in ToolHostMethod]?: (r: unknown) => Promise<unknown>;
};

/** A tool host whose methods are all spies, so any one of them can be asserted on. */
const createSpyToolHost = () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  createTerminal: vi.fn(),
  terminalOutput: vi.fn(),
  waitForTerminalExit: vi.fn(),
  releaseTerminal: vi.fn(),
  killTerminal: vi.fn(),
});

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

describe("ACPClient tool host delegation", () => {
  // Every method the agent can invoke on the client, with a params shape and a
  // reply distinct enough that a mis-wired delegation shows up as a wrong call
  // rather than a passing test.
  const FILE_ERR = ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED;
  const TERM_ERR = ERROR_MESSAGE.TERMINAL_TOOLS_NOT_CONFIGURED;

  const cases: ReadonlyArray<{
    method: ToolHostMethod;
    params: unknown;
    reply: unknown;
    unconfigured: string;
  }> = [
    {
      method: "readTextFile",
      params: { path: "/tmp/a" },
      reply: { content: "a" },
      unconfigured: FILE_ERR,
    },
    {
      method: "writeTextFile",
      params: { path: "/tmp/b", content: "b" },
      reply: {},
      unconfigured: FILE_ERR,
    },
    {
      method: "createTerminal",
      params: { command: "ls", args: [] },
      reply: { terminalId: "t1" },
      unconfigured: TERM_ERR,
    },
    {
      method: "terminalOutput",
      params: { terminalId: "t1" },
      reply: { output: "out" },
      unconfigured: TERM_ERR,
    },
    {
      method: "waitForTerminalExit",
      params: { terminalId: "t1" },
      reply: { exitCode: 0, signal: null },
      unconfigured: TERM_ERR,
    },
    { method: "releaseTerminal", params: { terminalId: "t1" }, reply: {}, unconfigured: TERM_ERR },
    { method: "killTerminal", params: { terminalId: "t1" }, reply: {}, unconfigured: TERM_ERR },
  ];

  for (const { method, params, reply, unconfigured } of cases) {
    it(`delegates ${method} to the tool host and returns its result`, async () => {
      const toolHost = createSpyToolHost();
      toolHost[method].mockResolvedValue(reply);
      const port = createAcpAgentPort(createMockConnection(), { toolHost });

      const result = await (port as PortWithClient)[method]?.(params);

      expect(toolHost[method]).toHaveBeenCalledWith(params);
      expect(result).toEqual(reply);
      // Delegation must be exact: no other tool-host method may be touched.
      for (const other of cases.map((c) => c.method).filter((m) => m !== method)) {
        expect(toolHost[other]).not.toHaveBeenCalled();
      }
    });

    it(`${method} throws the right not-configured error with no tool host`, async () => {
      const port = createAcpAgentPort(createMockConnection());
      // File and terminal report separately; a delegation wired to the wrong
      // requireToolHost kind would still throw, just with the other message.
      await expect((port as PortWithClient)[method]?.(params)).rejects.toThrow(unconfigured);
    });
  }
});
