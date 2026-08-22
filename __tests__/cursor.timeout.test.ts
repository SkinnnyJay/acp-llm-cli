import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { runCursorSpawnedCommand } from "../src/providers/cursor/cursor.spawn.utils";

/** Creates a fake child process that never exits on its own. */
function createHangingChild() {
  const emitter = new EventEmitter();
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const child = Object.assign(emitter, { stdout, stderr, stdin, kill: vi.fn(), pid: 99 });
  return child;
}

/** Creates a fake child process that exits after a short delay. */
function createExitingChild(exitCode: number, delayMs = 5) {
  const emitter = new EventEmitter();
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const child = Object.assign(emitter, { stdout, stderr, stdin, kill: vi.fn(), pid: 100 });
  setTimeout(() => {
    stdout.push(null);
    child.emit("close", exitCode);
  }, delayMs);
  return child;
}

describe("runCursorSpawnedCommand", () => {
  it("rejects with a timeout error when the child does not exit within timeoutMs", async () => {
    const child = createHangingChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    await expect(
      runCursorSpawnedCommand(
        "cursor-agent",
        ["-p"],
        { command: "cursor-agent", args: [], env: {} },
        { timeoutMs: 50, spawnFn: spawnFn as never }
      )
    ).rejects.toThrow(ERROR_MESSAGE.CURSOR_COMMAND_TIMEOUT(50));

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("resolves with stdout/stderr/exitCode when process exits cleanly", async () => {
    const child = createExitingChild(0);
    const spawnFn = vi.fn().mockReturnValue(child);

    const result = await runCursorSpawnedCommand(
      "cursor-agent",
      ["-p", "hello"],
      { command: "cursor-agent", args: [], env: {} },
      { timeoutMs: 1000, spawnFn: spawnFn as never }
    );

    expect(result.exitCode).toBe(0);
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
  });

  it("rejects when the child emits an error event", async () => {
    const emitter = new EventEmitter();
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const stdin = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    const child = Object.assign(emitter, { stdout, stderr, stdin, kill: vi.fn(), pid: 101 });

    setTimeout(() => child.emit("error", new Error("ENOENT: no such file")), 5);

    const spawnFn = vi.fn().mockReturnValue(child);

    await expect(
      runCursorSpawnedCommand(
        "cursor-agent",
        [],
        { command: "cursor-agent", args: [], env: {} },
        { timeoutMs: 1000, spawnFn: spawnFn as never }
      )
    ).rejects.toThrow("ENOENT");
  });

  it("accumulates stdout and stderr data before close", async () => {
    const emitter = new EventEmitter();
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const stdin = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    const child = Object.assign(emitter, { stdout, stderr, stdin, kill: vi.fn(), pid: 102 });
    const spawnFn = vi.fn().mockReturnValue(child);

    const promise = runCursorSpawnedCommand(
      "cursor-agent",
      [],
      { command: "cursor-agent", args: [], env: {} },
      { timeoutMs: 1000, spawnFn: spawnFn as never }
    );

    stdout.emit("data", "out-1");
    stderr.emit("data", "err-1");
    child.emit("close", 0);

    const result = await promise;
    expect(result.stdout).toBe("out-1");
    expect(result.stderr).toBe("err-1");
    expect(result.exitCode).toBe(0);
  });

  it("force-kills with SIGKILL after the force-kill grace window on timeout", async () => {
    vi.useFakeTimers();
    try {
      const child = createHangingChild();
      const spawnFn = vi.fn().mockReturnValue(child);

      const promise = runCursorSpawnedCommand(
        "cursor-agent",
        [],
        { command: "cursor-agent", args: [], env: {} },
        { timeoutMs: 50, spawnFn: spawnFn as never }
      );

      const assertion = expect(promise).rejects.toThrow(ERROR_MESSAGE.CURSOR_COMMAND_TIMEOUT(50));
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");

      await vi.advanceTimersByTimeAsync(2000);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});
