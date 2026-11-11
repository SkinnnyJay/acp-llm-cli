import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { ndJsonStream, type Stream } from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { CONNECTION_EVENT } from "../domain/connection.events";
import type { ConnectionStatus } from "../domain/connection.status";
import { CONNECTION_STATUS } from "../domain/connection.status";
import { ENCODING } from "../domain/encoding";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { ACP_ERROR_CODE, AgentProcessError } from "../domain/errors";
import { LIMIT } from "../domain/limits";
import { NODE_EVENT, NODE_SPAWN_ERROR } from "../domain/node.events";
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

interface ChildSession {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stream: Stream;
  /** Set before we kill it, so a late close is still recognised as one we asked for. */
  intentional: boolean;
}

export class StdioConnection extends EventEmitter<ConnectionEvents> implements IConnection {
  /**
   * The child currently being talked to, together with the stream built on it and whether this
   * connection asked it to stop.
   *
   * These were three connection-scoped fields hand-synchronised at four sites. `child` set with
   * `stream` undefined was representable and prevented only by convention - and `stream` is the
   * identity token acp.client uses to decide whether an exit belongs to its link.
   *
   * `intentional` lives on the session rather than in a single connection-wide slot, so any
   * number of deliberately-killed children can be pending at once. Note this is a robustness
   * change, not a bug fix: with the old single slot the first kill was forgotten when a second
   * teardown began, but that was unobservable, because the flag is only ever read after an
   * `isCurrent` check that a forgotten child always fails. The point is that the guarantee no
   * longer depends on the order of those two statements.
   *
   * `status` is deliberately NOT folded in: an errored child stays current and usable
   * (getStream() still returns its stream), so status is not derivable from the session.
   */
  private current: ChildSession | undefined;
  private status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;
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
    return this.current?.stream;
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
    const previous = this.current;
    if (previous) {
      previous.intentional = true;
      this.current = undefined;
      previous.child.kill?.(SIGNAL.TERM);
    }

    this.setStatus(CONNECTION_STATUS.CONNECTING);
    this.stderrLines.length = 0;

    try {
      const child = this.spawnFn(this.options.command, this.options.args ?? [], {
        cwd: this.options.cwd,
        env: mergeEnv(this.options.env),
      });
      // A child with no pid has not started: Node reports why (ENOENT for a missing binary,
      // EACCES) on `error` a tick later. Waiting for that tick turns it into a failed connect()
      // the caller awaits, instead of a CONNECTED state that collapses a moment later. The failed
      // child is never bound, so its later close is not reported as a second error.
      if (child.pid === undefined) await this.spawnErrorOnNextTick(child);
      // Everything between spawning and recording the session is guarded together. The process
      // is already running by this point, but nothing has been stored in `current`, so
      // disconnect() would find nothing to reap and the next connect() would see no previous
      // child - leaving it orphaned for the lifetime of the host process, with no listeners
      // bound, so a later 'error' on it would be unhandled. Both steps can throw on a child
      // without usable pipes: setEncoding on an absent stderr, and Writable/Readable.toWeb
      // inside createNdjsonStream.
      let session: ChildSession;
      try {
        this.bindStderrCapture(child);
        session = { child, stream: this.createNdjsonStream(child), intentional: false };
      } catch (setupError) {
        child.kill?.(SIGNAL.TERM);
        throw setupError;
      }
      this.current = session;
      this.bindChildProcessEvents(session);

      this.setStatus(CONNECTION_STATUS.CONNECTED);
    } catch (error) {
      this.setStatus(CONNECTION_STATUS.ERROR);
      this.emit(CONNECTION_EVENT.ERROR, this.spawnFailure(error));
    }
  }

  /**
   * Rejects with the child's `error` if it fires before the next macrotask, else resolves. Bounded
   * on purpose: an injected spawn function may return a child with no pid that never emits
   * `spawn` or `error`, and waiting on either event would hang connect() for it.
   */
  private spawnErrorOnNextTick(child: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        clearImmediate(timer);
        reject(error);
      };
      const timer = setImmediate(() => {
        child.off(NODE_EVENT.ERROR, onError);
        resolve();
      });
      child.once(NODE_EVENT.ERROR, onError);
    });
  }

  async disconnect(): Promise<void> {
    // Capture the session once: every callback below must act on this process, never on
    // whichever process happens to be current when the callback eventually runs.
    const session = this.current;
    if (!session) {
      this.setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }
    const { child } = session;
    session.intentional = true;
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
    if (this.current === session) {
      this.current = undefined;
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

  private bindChildProcessEvents(session: ChildSession): void {
    const { child } = session;
    // Both handlers are bound per child but mutate connection-wide state, so each one first
    // checks that it still owns that state. State is updated before the event announcing it,
    // so a listener always observes the status the event describes.
    child.on(NODE_EVENT.ERROR, (error: Error) => {
      // A child this connection no longer owns cannot put it into an error state, and reporting
      // its failure would hand listeners an error that contradicts connectionStatus.
      if (this.current !== session) {
        return;
      }
      this.setStatus(CONNECTION_STATUS.ERROR);
      // Node reports a spawn failure (missing binary included) here, after spawn() returned.
      const syscall = (error as NodeJS.ErrnoException).syscall;
      const isSpawnFailure = syscall?.startsWith(NODE_SPAWN_ERROR.SYSCALL_PREFIX) ?? false;
      this.emit(CONNECTION_EVENT.ERROR, isSpawnFailure ? this.spawnFailure(error) : error);
    });

    child.on(NODE_EVENT.CLOSE, (code: number | null, signal: string | null) => {
      const isCurrent = this.current === session;
      // Read from the session that actually exited, not from a connection-wide slot that may
      // have moved on to a different child since we killed this one.
      const wasDisconnecting = session.intentional;
      if (isCurrent) {
        this.current = undefined;
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

  private formatExitError(code: number | null, signal: string | null): AgentProcessError {
    const suffix = signal ? ` (signal ${signal})` : "";
    const rawDetails = this.stderrLines.length ? `\n${this.stderrLines.join("\n")}` : "";
    const details = rawDetails
      ? formatStderrForError(rawDetails, { debug: isDebugEnabled(this.options.env) })
      : "";
    return new AgentProcessError(
      ACP_ERROR_CODE.PROCESS_EXITED,
      ERROR_MESSAGE.AGENT_PROCESS_EXITED(code ?? "unknown", suffix, details),
      {
        command: this.options.command,
        exitCode: code,
        signal,
        stderr: details ? details.trimStart() : undefined,
      }
    );
  }

  /** The transport does not know the provider; the ACP client adds it and the install hint. */
  private spawnFailure(error: unknown): AgentProcessError {
    const { command } = this.options;
    const nodeCode = (error as NodeJS.ErrnoException | undefined)?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (nodeCode === NODE_SPAWN_ERROR.ENOENT) {
      return new AgentProcessError(
        ACP_ERROR_CODE.CLI_NOT_FOUND,
        ERROR_MESSAGE.CLI_NOT_FOUND(command),
        {
          command,
          cause: error,
        }
      );
    }
    const code =
      nodeCode === NODE_SPAWN_ERROR.EACCES
        ? ACP_ERROR_CODE.CLI_NOT_EXECUTABLE
        : ACP_ERROR_CODE.SPAWN_FAILED;
    return new AgentProcessError(code, message, { command, cause: error });
  }
}
