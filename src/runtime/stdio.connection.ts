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
import type { IConnection } from "./connection.interface";
import { isDebugEnabled, mergeEnv } from "./env.reader";
import type { SpawnOptions as SpawnOptionsType } from "./types";

export type SpawnFunction = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: ProcessEnv }
) => ChildProcessWithoutNullStreams;

export class StdioConnection
  extends EventEmitter<{
    state: (status: ConnectionStatus) => void;
    error: (error: Error) => void;
    exit: (info: { code: number | null; signal: string | null }) => void;
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
    if (!this.child) {
      this.setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }
    this.isDisconnecting = true;
    await new Promise<void>((resolve) => {
      this.child?.once(NODE_EVENT.CLOSE, () => resolve());
      this.child?.kill?.(SIGNAL.TERM);
      setTimeout(() => {
        this.child?.kill?.(SIGNAL.KILL);
        resolve();
      }, TIMEOUT.DISCONNECT_FORCE_MS).unref();
    });
    this.child = undefined;
    this.stream = undefined;
    this.isDisconnecting = false;
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
    child.on(NODE_EVENT.ERROR, (error: Error) => {
      this.emit(CONNECTION_EVENT.ERROR, error);
      this.setStatus(CONNECTION_STATUS.ERROR);
    });

    child.on(NODE_EVENT.CLOSE, (code: number | null, signal: string | null) => {
      const wasDisconnecting = this.isDisconnecting;
      this.isDisconnecting = false;
      this.emit(CONNECTION_EVENT.EXIT, { code, signal });
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

  private formatExitError(code: number | null, signal: string | null): Error {
    const suffix = signal ? ` (signal ${signal})` : "";
    const rawDetails = this.stderrLines.length ? `\n${this.stderrLines.join("\n")}` : "";
    const details = rawDetails
      ? formatStderrForError(rawDetails, { debug: isDebugEnabled(this.options.env) })
      : "";
    return new Error(ERROR_MESSAGE.AGENT_PROCESS_EXITED(code ?? "unknown", suffix, details));
  }
}
