import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { HELP_FLAG, extractHelp } from "../src/cli/help.extractor";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { SIGNAL } from "../src/domain/signals";
import { TIMEOUT } from "../src/domain/timeouts";

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
    pid: 11,
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

describe("extractHelp", () => {
  it("returns stdout on success and appends --help", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      expect(args).toContain(HELP_FLAG);
      return createFakeChild({ stdout: "Usage: tool\n", exitCode: 0 });
    });

    const out = await extractHelp({
      command: "fake-cli",
      args: ["sub"],
      spawnFn: spawnFn as never,
    });
    expect(out).toBe("Usage: tool\n");
    expect(spawnFn).toHaveBeenCalledWith(
      "fake-cli",
      ["sub", HELP_FLAG],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("rejects on nonzero exit", async () => {
    const spawnFn = vi.fn().mockReturnValue(createFakeChild({ stderr: "boom", exitCode: 2 }));

    await expect(extractHelp({ command: "fake-cli", spawnFn: spawnFn as never })).rejects.toThrow(
      ERROR_MESSAGE.HELP_COMMAND_FAILED(2, "boom")
    );
  });

  it("SIGTERM then SIGKILL on timeout", async () => {
    vi.useFakeTimers();
    const child = createFakeChild({ hang: true });
    const spawnFn = vi.fn().mockReturnValue(child);

    const promise = extractHelp({
      command: "fake-cli",
      timeoutMs: 100,
      spawnFn: spawnFn as never,
    });
    const assertion = expect(promise).rejects.toThrow(ERROR_MESSAGE.HELP_EXTRACTION_TIMEOUT(100));

    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith(SIGNAL.TERM);

    await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS);
    expect(child.kill).toHaveBeenCalledWith(SIGNAL.KILL);

    await assertion;
    vi.useRealTimers();
  });
});
