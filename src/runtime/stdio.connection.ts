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
import { SIGNAL } from "../domain/signals";
import { TIMEOUT } from "../domain/timeouts";
import type { IConnection } from "./connection.interface";
import { mergeEnv } from "./env.reader";
import type { SpawnOptions as SpawnOptionsType } from "./types";

export type SpawnFunction = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv }
) => ChildProcessWithoutNullStreams;

export class StdioConnection
  extends EventEmitter<{
    state: (status: ConnectionStatus) => void;
    error: (error: Error) => void;
    exit: (info: { code: number | null; signal: NodeJS.Signals | null }) => void;
  }>
  implements IConnection
{
  private status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;
  private child: ChildProcessWithoutNullStreams | undefined;
  private stream: Stream | undefined;
  private isDisconnecting = false;
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
    this.isDisconnecting = false;
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
    const child = this.child;
    if (!child) {
      this.setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }
    this.isDisconnecting = true;
    let forceKilled = false;
    await new Promise<void>((resolve) => {
      let settled = false;
      const onClose = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        resolve();
      };
      // Capture THIS child and clear the timer on close. The frozen version
      // read `this.child` inside an uncleared timer: after a fast
      // disconnect→connect (exactly what restart does), the stale timer fired
      // DISCONNECT_FORCE_MS later and SIGKILLed the freshly spawned
      // replacement process.
      const forceKillTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        forceKilled = true;
        child.removeListener(NODE_EVENT.CLOSE, onClose);
        child.kill(SIGNAL.KILL);
        resolve();
      }, TIMEOUT.DISCONNECT_FORCE_MS);
      forceKillTimer.unref();
      child.once(NODE_EVENT.CLOSE, onClose);
      child.kill(SIGNAL.TERM);
    });
    if (this.child === child) {
      this.child = undefined;
      this.stream = undefined;
    }
    // On the force-kill path the close event has not fired yet; leave
    // isDisconnecting set so the late SIGKILL close is treated as an
    // intentional shutdown instead of an error.
    if (!forceKilled) this.isDisconnecting = false;
    this.setStatus(CONNECTION_STATUS.DISCONNECTED);
  }

  private bindStderrCapture(child: ChildProcessWithoutNullStreams): void {
    child.stderr.setEncoding(ENCODING.UTF8);
    child.stderr.on(NODE_EVENT.DATA, (chunk: string) => this.captureStderr(chunk));
    // Writing to a dead child's stdin raises 'error' (EPIPE); with no listener
    // Node throws it as an uncaught exception. Capture it as a diagnostic —
    // the close handler reports the real exit error.
    child.stdin.on(NODE_EVENT.ERROR, (error: Error) => {
      this.captureStderr(`stdin: ${error.message}`);
    });
  }

  private createNdjsonStream(child: ChildProcessWithoutNullStreams): Stream {
    const input = Writable.toWeb(child.stdin);
    const outputReader = Readable.toWeb(child.stdout).getReader();
    const output = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const result = await outputReader.read();
        if (result.done) {
          controller.close();
          return;
        }
        if (result.value) controller.enqueue(result.value);
      },
      cancel(reason) {
        void outputReader.cancel(reason);
      },
    });
    return ndJsonStream(input, output);
  }

  private bindChildProcessEvents(child: ChildProcessWithoutNullStreams): void {
    child.on(NODE_EVENT.ERROR, (error: Error) => {
      // Stale-closure guard: a late error from a replaced child must not
      // flip the state of a newer connection.
      if (this.child !== child) return;
      this.emit(CONNECTION_EVENT.ERROR, error);
      this.setStatus(CONNECTION_STATUS.ERROR);
    });

    child.on(NODE_EVENT.CLOSE, (code: number | null, signal: NodeJS.Signals | null) => {
      const isCurrent = this.child === child;
      const wasDisconnecting = this.isDisconnecting;
      if (isCurrent) this.isDisconnecting = false;
      this.emit(CONNECTION_EVENT.EXIT, { code, signal });
      if (!isCurrent) {
        // A replaced/force-killed child closing late must not wipe the state
        // or status of the connection's CURRENT child.
        return;
      }
      this.child = undefined;
      this.stream = undefined;
      const hasError = !wasDisconnecting && ((code !== null && code !== 0) || signal !== null);
      if (hasError) {
        this.emit(CONNECTION_EVENT.ERROR, this.formatExitError(code, signal));
        this.setStatus(CONNECTION_STATUS.ERROR);
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

  private formatExitError(code: number | null, signal: NodeJS.Signals | null): Error {
    const suffix = signal ? ` (signal ${signal})` : "";
    const details = this.stderrLines.length ? `\n${this.stderrLines.join("\n")}` : "";
    return new Error(ERROR_MESSAGE.AGENT_PROCESS_EXITED(code ?? "unknown", suffix, details));
  }
}
