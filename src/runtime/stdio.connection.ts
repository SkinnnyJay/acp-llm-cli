import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { type Stream, ndJsonStream } from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { CONNECTION_EVENT } from "../domain/connection.events";
import { CONNECTION_STATUS } from "../domain/connection.status";
import type { ConnectionStatus } from "../domain/connection.status";
import { ENCODING } from "../domain/encoding";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { LIMIT } from "../domain/limits";
import { NODE_EVENT } from "../domain/node.events";
import type { ProcessEnv } from "../domain/process.env";
import { SIGNAL } from "../domain/signals";
import { formatStderrForError } from "../domain/stderr.format";
import { TIMEOUT } from "../domain/timeouts";
import type { ConnectionEvents, IConnection } from "./connection.interface";
import { isDebugEnabled, mergeEnv } from "./env.reader";
import type { SpawnOptions as SpawnOptionsType } from "./types";

export type SpawnFunction = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: ProcessEnv }
) => ChildProcessWithoutNullStreams;

export class StdioConnection extends EventEmitter<ConnectionEvents> implements IConnection {
  private status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;
  private child: ChildProcessWithoutNullStreams | undefined;
  private stream: Stream | undefined;
  /** The child a disconnect() is tearing down. Scoped per child so a late exit is still recognised as intentional. */
  private closingChild: ChildProcessWithoutNullStreams | undefined;
  private readonly stderrLines: string[] = [];
  private readonly spawnFn: SpawnFunction;
  private readonly options: SpawnOptionsType;

  constructor(options: SpawnOptionsType, spawnFn?: SpawnFunction) {
    super();
    this.options = options;
    this.spawnFn = spawnFn ?? spawn;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  getStream(): Stream | undefined {
    return this.stream;
  }

  async connect(): Promise<void> {
    if (
      this.status === CONNECTION_STATUS.CONNECTING ||
      this.status === CONNECTION_STATUS.CONNECTED
    ) {
      return;
    }
    // A previous child can still be alive here (e.g. status ERROR after a child error event).
    // Tear it down first so it is not orphaned by the respawn below.
    const previous = this.child;
    if (previous) {
      this.closingChild = previous;
      this.child = undefined;
      this.stream = undefined;
      previous.kill?.(SIGNAL.TERM);
    }

    this.setStatus(CONNECTION_STATUS.CONNECTING);
    this.stderrLines.length = 0;

    try {
      const child = this.spawnFn(this.options.command, this.options.args ?? [], {
        cwd: this.options.cwd,
        env: mergeEnv(this.options.env),
      });
      this.child = child;
      this.bindStderrCapture(child);
      this.stream = this.createNdjsonStream(child);
      this.bindChildProcessEvents(child);

      this.setStatus(CONNECTION_STATUS.CONNECTED);
    } catch (error) {
      this.setStatus(CONNECTION_STATUS.ERROR);
      this.emit(CONNECTION_EVENT.ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async disconnect(): Promise<void> {
    // Capture the child once: every callback below must act on this process, never on
    // whichever process happens to be current when the callback eventually runs.
    const child = this.child;
    if (!child) {
      this.setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }
    this.closingChild = child;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve) => {
        child.once(NODE_EVENT.CLOSE, () => resolve());
        child.kill?.(SIGNAL.TERM);
        forceKillTimer = setTimeout(() => {
          child.kill?.(SIGNAL.KILL);
          resolve();
        }, TIMEOUT.DISCONNECT_FORCE_MS);
        forceKillTimer.unref?.();
      });
    } finally {
      clearTimeout(forceKillTimer);
    }
    if (this.child === child) {
      this.child = undefined;
      this.stream = undefined;
    }
    this.setStatus(CONNECTION_STATUS.DISCONNECTED);
  }

  private bindStderrCapture(child: ChildProcessWithoutNullStreams): void {
    child.stderr.setEncoding(ENCODING.UTF8);
    child.stderr.on(NODE_EVENT.DATA, (chunk: string) => this.captureStderr(chunk));
  }

  private createNdjsonStream(child: ChildProcessWithoutNullStreams): Stream {
    const input = Writable.toWeb(child.stdin);
    const output = Readable.toWeb(child.stdout);
    return ndJsonStream(input, output);
  }

  private bindChildProcessEvents(child: ChildProcessWithoutNullStreams): void {
    // Both handlers are bound per child but mutate connection-wide state, so each one first
    // checks that it still owns that state. State is updated before the event announcing it,
    // so a listener always observes the status the event describes.
    child.on(NODE_EVENT.ERROR, (error: Error) => {
      // A child this connection no longer owns cannot put it into an error state, and reporting
      // its failure would hand listeners an error that contradicts connectionStatus.
      if (this.child !== child) {
        return;
      }
      this.setStatus(CONNECTION_STATUS.ERROR);
      this.emit(CONNECTION_EVENT.ERROR, error);
    });

    child.on(NODE_EVENT.CLOSE, (code: number | null, signal: string | null) => {
      const isCurrent = this.child === child;
      const wasDisconnecting = this.closingChild === child;
      if (wasDisconnecting) {
        this.closingChild = undefined;
      }
      if (isCurrent) {
        this.child = undefined;
        this.stream = undefined;
      }
      // Emitted for every child, current or stale: this process really did exit, and it is the
      // only signal distinguishing "died on its own" from "we asked it to stop".
      this.emit(CONNECTION_EVENT.EXIT, { code, signal });
      if (!isCurrent) {
        return;
      }
      const hasError = !wasDisconnecting && ((code !== null && code !== 0) || signal !== null);
      if (hasError) {
        this.setStatus(CONNECTION_STATUS.ERROR);
        this.emit(CONNECTION_EVENT.ERROR, this.formatExitError(code, signal));
      } else {
        this.setStatus(CONNECTION_STATUS.DISCONNECTED);
      }
    });
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit(CONNECTION_EVENT.STATE, status);
  }

  private captureStderr(chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    this.stderrLines.push(...lines);
    if (this.stderrLines.length > LIMIT.STDERR_LINES) {
      this.stderrLines.splice(0, this.stderrLines.length - LIMIT.STDERR_LINES);
    }
  }

  private formatExitError(code: number | null, signal: string | null): Error {
    const suffix = signal ? ` (signal ${signal})` : "";
    const rawDetails = this.stderrLines.length ? `\n${this.stderrLines.join("\n")}` : "";
    const details = rawDetails
      ? formatStderrForError(rawDetails, { debug: isDebugEnabled(this.options.env) })
      : "";
    return new Error(ERROR_MESSAGE.AGENT_PROCESS_EXITED(code ?? "unknown", suffix, details));
  }
}
