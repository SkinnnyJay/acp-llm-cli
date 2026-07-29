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
        50,
        spawnFn as Parameters<typeof runCursorSpawnedCommand>[5]
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
      1000,
      spawnFn as Parameters<typeof runCursorSpawnedCommand>[5]
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
        1000,
        spawnFn as Parameters<typeof runCursorSpawnedCommand>[5]
      )
    ).rejects.toThrow("ENOENT");
  });
});
