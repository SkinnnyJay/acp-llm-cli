import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { CURSOR_CLI_ARG } from "../src/providers/cursor/constants";
import { CursorAgentPort } from "../src/providers/cursor/cursor.agent.port";

const SESSION_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function createFakeChild(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
  hang?: boolean;
}) {
  const emitter = new EventEmitter();
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const child = Object.assign(emitter, {
    stdout,
    stderr,
    stdin,
    kill: vi.fn(),
    pid: 42,
  });

  if (!opts.hang) {
    setTimeout(() => {
      if (opts.stdout) stdout.push(opts.stdout);
      if (opts.stderr) stderr.push(opts.stderr);
      stdout.push(null);
      stderr.push(null);
      child.emit("close", opts.exitCode ?? 0);
    }, opts.delayMs ?? 5);
  }

  return child;
}

describe("CursorAgentPort spawn contract", () => {
  it("health-check connect succeeds and omits --trust by default", async () => {
    const spawnCalls: { command: string; args: string[] }[] = [];
    const spawnFn = vi.fn().mockImplementation((command: string, args: string[]) => {
      spawnCalls.push({ command, args });
      return createFakeChild({ exitCode: 0, stdout: "ok\n" });
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn as never }
    );

    await port.connect();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    expect(spawnCalls[0]?.args).toContain(CURSOR_CLI_ARG.PRINT);
    expect(spawnCalls[0]?.args).not.toContain(CURSOR_CLI_ARG.TRUST);
  });

  it("adds --trust only when config.trust is true", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      expect(args).toContain(CURSOR_CLI_ARG.TRUST);
      return createFakeChild({ exitCode: 0 });
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {}, trust: true },
      { spawnFn: spawnFn as never }
    );
    await port.connect();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
  });

  it("newSession extracts UUID session id", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      if (args.includes(CURSOR_CLI_ARG.CREATE_CHAT)) {
        return createFakeChild({ stdout: `Created ${SESSION_UUID}\n`, exitCode: 0 });
      }
      return createFakeChild({ exitCode: 0 });
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn as never }
    );
    await port.connect();
    const session = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    expect(session.sessionId).toBe(SESSION_UUID);
  });

  it("prompt builds argv and parses NDJSON result", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      if (args.includes(CURSOR_CLI_ARG.CREATE_CHAT)) {
        return createFakeChild({ stdout: SESSION_UUID, exitCode: 0 });
      }
      if (args.includes("hello")) {
        expect(args).toContain(CURSOR_CLI_ARG.RESUME);
        expect(args).toContain(SESSION_UUID);
        expect(args).not.toContain(CURSOR_CLI_ARG.TRUST);
        const ndjson = JSON.stringify({
          type: "result",
          subtype: "success",
          result: "world",
          session_id: SESSION_UUID,
        });
        return createFakeChild({ stdout: `${ndjson}\n`, exitCode: 0 });
      }
      return createFakeChild({ exitCode: 0 });
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn as never }
    );
    await port.connect();
    await port.newSession({ cwd: "/tmp", mcpServers: [] });
    const res = await port.prompt({
      sessionId: SESSION_UUID,
      prompt: [{ type: "text", text: "hello" }],
    });
    expect(res.stopReason).toBe("end_turn");
    expect(res).toMatchObject({ content: [{ type: "text", text: "world" }] });
  });

  it("throws when NDJSON result is missing", async () => {
    const spawnFn = vi.fn().mockImplementation(() =>
      createFakeChild({ stdout: "not-json\n", exitCode: 0 })
    );
    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn as never }
    );
    await port.connect();
    await expect(
      port.prompt({
        sessionId: "s1",
        prompt: [{ type: "text", text: "hi" }],
      })
    ).rejects.toThrow(ERROR_MESSAGE.CURSOR_RESULT_MISSING);
  });

  it("disconnect aborts in-flight spawn work", async () => {
    const kill = vi.fn();
    let spawnCount = 0;
    const spawnFn = vi.fn().mockImplementation(() => {
      spawnCount++;
      if (spawnCount === 1) {
        return createFakeChild({ exitCode: 0 });
      }
      const emitter = new EventEmitter();
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const stdin = new Writable({
        write(_chunk, _enc, cb) {
          cb();
        },
      });
      return Object.assign(emitter, { stdout, stderr, stdin, kill, pid: 7 });
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn as never }
    );
    await port.connect();

    const promptPromise = port.prompt({
      sessionId: "s1",
      prompt: [{ type: "text", text: "hang" }],
    });
    // Attach rejection handler before disconnect to avoid unhandled rejection races.
    const promptExpectation = expect(promptPromise).rejects.toThrow(/aborted/i);

    await new Promise((r) => setTimeout(r, 10));
    await port.disconnect();

    await promptExpectation;
    expect(kill).toHaveBeenCalled();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });
});
