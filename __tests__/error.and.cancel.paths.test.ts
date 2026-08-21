import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { extractHelp } from "../src/cli/help.extractor";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { cursorCliSpec } from "../src/providers/cursor/cli.definition";
import { CursorAgentPort } from "../src/providers/cursor/cursor.agent.port";
import { runCursorSpawnedCommand } from "../src/providers/cursor/cursor.spawn.utils";
import { createCursorConfig } from "./helpers/cursor.config";

/** A child that never exits, so only the path under test can settle the promise. */
function createInertChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new Readable({ read() {} }),
    stderr: new Readable({ read() {} }),
    stdin: new Writable({
      write(_c: unknown, _e: unknown, cb: () => void) {
        cb();
      },
    }),
    kill: vi.fn(),
    pid: 4242,
  });
}

describe("cursor spawn cancellation", () => {
  it("rejects without spawning when the signal is already aborted", async () => {
    const spawnFn = vi.fn().mockReturnValue(createInertChild());
    const controller = new AbortController();
    controller.abort();

    await expect(
      runCursorSpawnedCommand("cursor-agent", [], createCursorConfig(), {
        signal: controller.signal,
        spawnFn,
      })
    ).rejects.toThrow(ERROR_MESSAGE.CURSOR_COMMAND_ABORTED);

    // The point of the early return: an already-cancelled call must not start a process.
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("rejects and kills the child when the signal aborts mid-flight", async () => {
    const child = createInertChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const controller = new AbortController();

    const pending = runCursorSpawnedCommand("cursor-agent", [], createCursorConfig(), {
      signal: controller.signal,
      spawnFn,
    });

    expect(spawnFn).toHaveBeenCalled();
    controller.abort();

    await expect(pending).rejects.toThrow(ERROR_MESSAGE.CURSOR_COMMAND_ABORTED);
    expect(child.kill).toHaveBeenCalled();
  });
});

describe("cursor buildArgs mode handling", () => {
  it("appends --mode only when a mode is configured", () => {
    const withMode = cursorCliSpec.buildArgs(createCursorConfig({ mode: "plan" }));
    const withoutMode = cursorCliSpec.buildArgs(createCursorConfig());

    expect(withMode).toContain("--mode");
    expect(withMode).toContain("plan");
    expect(withoutMode).not.toContain("--mode");
  });
});

describe("help extraction spawn failure", () => {
  it("rejects with the spawn error when the binary cannot be launched", async () => {
    const child = createInertChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const pending = extractHelp({ command: "does-not-exist", spawnFn });

    // What Node emits when the binary is missing: an "error" event, never "close".
    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(pending).rejects.toThrow("spawn ENOENT");
  });
});

describe("CursorAgentPort connect health check", () => {
  const spawnThatExits = (exitCode: number, stderr: string) =>
    vi.fn().mockImplementation(() => {
      const child = createInertChild();
      child.stderr.on("end", () => child.emit("close", exitCode, null));
      queueMicrotask(() => {
        if (stderr) child.stderr.push(stderr);
        child.stderr.push(null);
        child.stdout.push(null);
      });
      return child;
    });

  it("goes to ERROR and reports stderr when the health check exits non-zero", async () => {
    const port = new CursorAgentPort(createCursorConfig(), {
      spawnFn: spawnThatExits(1, "cursor-agent: not logged in"),
    });
    const errors: Error[] = [];
    port.on("error", (e) => errors.push(e));

    await port.connect();

    expect(port.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
    expect(errors).toHaveLength(1);
  });

  it("goes to ERROR when the spawn itself throws", async () => {
    const port = new CursorAgentPort(createCursorConfig(), {
      spawnFn: vi.fn().mockImplementation(() => {
        throw new Error("spawn failed outright");
      }),
    });
    const errors: Error[] = [];
    port.on("error", (e) => errors.push(e));

    await port.connect();

    expect(port.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
    expect(errors[0]?.message).toContain("spawn failed outright");
  });
});

describe("CursorAgentPort prompt with no parseable result", () => {
  // close has to land after the data events have flushed, or the collector still
  // holds an empty buffer when the promise settles. Waiting on the stream's own
  // "end" rather than a timer keeps that ordering guaranteed instead of likely.
  const spawnPrinting = (stdout: string) =>
    vi.fn().mockImplementation(() => {
      const child = createInertChild();
      child.stdout.on("end", () => child.emit("close", 0, null));
      queueMicrotask(() => {
        if (stdout) child.stdout.push(stdout);
        child.stdout.push(null);
        child.stderr.push(null);
      });
      return child;
    });

  it("includes what the CLI actually said", async () => {
    // cursor-agent exits 0 while printing this, so without it in the message a
    // caller is told only that parsing failed - not that they are logged out.
    const port = new CursorAgentPort(createCursorConfig(), {
      spawnFn: spawnPrinting("Error: Authentication required. Please run 'agent login' first.\n"),
    });

    await expect(
      port.prompt({ sessionId: "s1", prompt: [{ type: "text", text: "hi" }] })
    ).rejects.toThrow(/Authentication required/);
  });

  it("falls back to the bare message when the CLI printed nothing", async () => {
    const port = new CursorAgentPort(createCursorConfig(), { spawnFn: spawnPrinting("") });

    await expect(
      port.prompt({ sessionId: "s1", prompt: [{ type: "text", text: "hi" }] })
    ).rejects.toThrow(ERROR_MESSAGE.CURSOR_RESULT_MISSING);
  });
});
