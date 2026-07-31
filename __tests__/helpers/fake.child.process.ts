import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { vi } from "vitest";

export interface FakeChildOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
  hang?: boolean;
  pid?: number;
}

export interface FakeChildHandle {
  child: EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    stdin: Writable;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  triggerExit(code?: number | null, signal?: string | null): void;
  triggerError(err: Error): void;
}

/** Shared fake child_process for spawn injection tests. */
export function createFakeChild(opts: FakeChildOptions = {}): FakeChildHandle {
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
    pid: opts.pid ?? 42,
  });

  const triggerExit = (code: number | null = opts.exitCode ?? 0, signal: string | null = null) => {
    if (opts.stdout) stdout.push(opts.stdout);
    if (opts.stderr) stderr.push(opts.stderr);
    stdout.push(null);
    stderr.push(null);
    child.emit("close", code, signal);
  };

  if (!opts.hang) {
    // setTimeout(0) so callers can attach stdout/stderr listeners before close.
    const delay = opts.delayMs ?? 0;
    setTimeout(() => triggerExit(), delay);
  }

  return {
    child,
    triggerExit,
    triggerError(err: Error) {
      child.emit("error", err);
    },
  };
}
