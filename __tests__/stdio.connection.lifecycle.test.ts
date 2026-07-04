import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { StdioConnection } from "../src/runtime/stdio.connection";
import type { SpawnFunction } from "../src/runtime/stdio.connection";

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kills: Array<string | number | undefined> = [];
  autoCloseOnTerm = true;

  kill(signal?: string | number): boolean {
    this.kills.push(signal);
    if (signal === "SIGTERM" && this.autoCloseOnTerm) {
      queueMicrotask(() => this.emit("close", null, "SIGTERM"));
    }
    return true;
  }
}

describe("StdioConnection lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeConn = () => {
    const children: FakeChild[] = [];
    const spawnFn: SpawnFunction = () => {
      const child = new FakeChild();
      children.push(child);
      return child as never;
    };
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    return { conn, children };
  };

  it("force-kill timer targets the OLD child, never a freshly reconnected one", async () => {
    // Frozen version: the timer read `this.child` when it fired, and was
    // never cleared — after disconnect()+connect() (exactly what restart
    // does), the stale timer SIGKILLed the NEW process 500ms later.
    const { conn, children } = makeConn();

    await conn.connect();
    const first = children[0] as FakeChild;
    first.autoCloseOnTerm = false; // stubborn child: ignores SIGTERM

    const disconnectPromise = conn.disconnect();
    await vi.advanceTimersByTimeAsync(600); // past DISCONNECT_FORCE_MS
    await disconnectPromise;

    expect(first.kills).toContain("SIGTERM");
    expect(first.kills).toContain("SIGKILL");

    await conn.connect();
    const second = children[1] as FakeChild;
    expect(second).toBeDefined();

    await vi.advanceTimersByTimeAsync(2000);
    expect(second.kills).toHaveLength(0);
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
  });

  it("late close of a force-killed child does not error the new connection", async () => {
    const { conn, children } = makeConn();

    await conn.connect();
    const first = children[0] as FakeChild;
    first.autoCloseOnTerm = false;

    const disconnectPromise = conn.disconnect();
    await vi.advanceTimersByTimeAsync(600);
    await disconnectPromise;

    await conn.connect();
    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    // The SIGKILLed old child finally reports close — with a signal, which the
    // frozen close handler treated as a fatal error of the CURRENT connection
    // (wiped this.child/this.stream and flipped status to ERROR).
    first.emit("close", null, "SIGKILL");

    expect(errors).toHaveLength(0);
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    expect(conn.getStream()).toBeDefined();
  });

  it("graceful disconnect (child obeys SIGTERM) never sends SIGKILL", async () => {
    const { conn, children } = makeConn();
    await conn.connect();
    const child = children[0] as FakeChild;

    const disconnectPromise = conn.disconnect();
    await vi.advanceTimersByTimeAsync(0); // flush the microtask close
    await disconnectPromise;
    await vi.advanceTimersByTimeAsync(2000); // stale-timer window

    expect(child.kills).toEqual(["SIGTERM"]);
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("stdin EPIPE-style error is captured, not thrown as uncaught", async () => {
    const { conn, children } = makeConn();
    await conn.connect();
    const child = children[0] as FakeChild;

    // With no 'error' listener on stdin this throws synchronously and takes
    // the process down; the connection must absorb it as a diagnostic.
    expect(() => child.stdin.emit("error", new Error("write EPIPE"))).not.toThrow();
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
  });
});
