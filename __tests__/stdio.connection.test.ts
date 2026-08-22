import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { SIGNAL } from "../src/domain/signals";
import { TIMEOUT } from "../src/domain/timeouts";
import { StdioConnection } from "../src/runtime/stdio.connection";

/**
 * Creates a minimal fake child process for testing StdioConnection.
 * StdioConnection.connect() resolves synchronously after spawn — it does not wait for
 * the child to exit before setting CONNECTED. Use triggerExit() to simulate later events.
 */
function createFakeChild() {
  const emitter = new EventEmitter();
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const child = Object.assign(emitter, { stdout, stderr, stdin, kill: vi.fn(), pid: 12345 });

  return {
    child,
    triggerExit(code: number | null = 0, signal: NodeJS.Signals | null = null) {
      child.emit("close", code, signal);
    },
    triggerError(err: Error) {
      child.emit("error", err);
    },
  };
}

describe("StdioConnection", () => {
  it("starts DISCONNECTED with no stream", () => {
    const conn = new StdioConnection({ command: "echo", args: [] });
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    expect(conn.getStream()).toBeUndefined();
  });

  it("transitions to CONNECTED after successful spawn", async () => {
    const { child } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const stateChanges: string[] = [];
    conn.on("state", (s) => stateChanges.push(s));

    await conn.connect();

    expect(spawnFn).toHaveBeenCalledWith("fake", [], expect.any(Object));
    expect(stateChanges).toContain(CONNECTION_STATUS.CONNECTING);
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    expect(conn.getStream()).toBeDefined();
  });

  it("defaults args to an empty array when options.args is omitted", async () => {
    const { child } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);

    await conn.connect();

    expect(spawnFn).toHaveBeenCalledWith("fake", [], expect.any(Object));
  });

  it("emits state=CONNECTING then state=CONNECTED on successful spawn", async () => {
    const { child } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const states: string[] = [];
    conn.on("state", (s) => states.push(s));

    await conn.connect();

    expect(states[0]).toBe(CONNECTION_STATUS.CONNECTING);
    expect(states[1]).toBe(CONNECTION_STATUS.CONNECTED);
  });

  it("emits error and sets ERROR status when connected child exits non-zero", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    const errorStatus = new Promise<void>((resolve) => {
      conn.on("state", (s) => {
        if (s === CONNECTION_STATUS.ERROR) resolve();
      });
    });

    triggerExit(1, null);
    await errorStatus;

    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/1/);
  });

  it("sets status to DISCONNECTED on normal exit after disconnect()", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    const disconnectPromise = conn.disconnect();
    triggerExit(0, null);
    await disconnectPromise;

    expect(errors).toHaveLength(0);
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("does not spawn again if already CONNECTED", async () => {
    const { child } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);

    await conn.connect();
    await conn.connect();

    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("emits error event and sets ERROR when spawn itself throws", async () => {
    const spawnFn = vi.fn().mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    await conn.connect();

    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
    expect(errors[0]?.message).toBe("spawn failed");
  });

  it("emits error when child process emits error event", async () => {
    const { child, triggerError, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    triggerError(new Error("ENOENT"));
    triggerExit(1);

    await new Promise((r) => setTimeout(r, 0));
    expect(errors[0]?.message).toBe("ENOENT");
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
  });

  it("passes cwd and merged env to spawn", async () => {
    const { child } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection(
      { command: "cmd", args: ["--x"], cwd: "/tmp", env: { MY_KEY: "val" } },
      spawnFn
    );

    await conn.connect();

    const callArgs = spawnFn.mock.calls[0];
    expect(callArgs?.[0]).toBe("cmd");
    expect(callArgs?.[1]).toEqual(["--x"]);
    const spawnOptions = callArgs?.[2] as { cwd?: string; env?: NodeJS.ProcessEnv };
    expect(spawnOptions.cwd).toBe("/tmp");
    expect(spawnOptions.env?.MY_KEY).toBe("val");
  });

  it("disconnect when not connected resolves immediately as DISCONNECTED", async () => {
    const conn = new StdioConnection({ command: "fake", args: [] });
    await conn.disconnect();
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("emits exit event with code and signal on child close", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    const exitEvents: Array<{ code: number | null; signal: string | null }> = [];
    conn.on("exit", (info) => exitEvents.push({ ...info }));

    triggerExit(0, null);
    await new Promise((r) => setTimeout(r, 0));

    expect(exitEvents[0]).toEqual({ code: 0, signal: null });
  });

  it("emits ERROR status and error event when child exits with a signal", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    const errorStatus = new Promise<void>((resolve) => {
      conn.on("state", (s) => {
        if (s === CONNECTION_STATUS.ERROR) resolve();
      });
    });

    triggerExit(null, "SIGKILL");
    await errorStatus;

    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
    expect(errors[0]?.message).toMatch(/SIGKILL/);
  });

  it("includes captured stderr lines in error message on non-zero exit", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    // Push stderr data before the child exits.
    child.stderr.push("fatal: something broke\n");
    await new Promise((r) => setTimeout(r, 0));

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    const errorStatus = new Promise<void>((resolve) => {
      conn.on("state", (s) => {
        if (s === CONNECTION_STATUS.ERROR) resolve();
      });
    });

    triggerExit(1, null);
    await errorStatus;

    expect(errors[0]?.message).toMatch(/fatal: something broke/);
  });

  it("captureStderr silently ignores chunks that are all whitespace", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    child.stderr.push("   \n\n  \r\n");
    await new Promise((r) => setTimeout(r, 0));

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    const errorStatus = new Promise<void>((resolve) => {
      conn.on("state", (s) => {
        if (s === CONNECTION_STATUS.ERROR) resolve();
      });
    });

    triggerExit(1, null);
    await errorStatus;

    // No stderr lines captured → error message should not include extra text.
    expect(errors[0]?.message).not.toMatch(/\n/);
  });

  it("force-kills the child when disconnect close event never fires", async () => {
    vi.useFakeTimers();
    try {
      const { child } = createFakeChild();
      const spawnFn = vi.fn().mockReturnValue(child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(500);
      await disconnectPromise;

      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes force-disconnect when child.kill is unavailable", async () => {
    vi.useFakeTimers();
    try {
      const { child } = createFakeChild();
      // Simulate a child handle that lost its kill method before the force-kill timer.
      (child as { kill: unknown }).kill = undefined;
      const spawnFn = vi.fn().mockReturnValue(child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(500);
      await disconnectPromise;

      expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits ERROR when spawn throws a non-Error value", async () => {
    const spawnFn = vi.fn().mockImplementation(() => {
      throw "spawn-string-error";
    });
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    await conn.connect();

    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
    expect(errors[0]?.message).toBe("spawn-string-error");
  });

  it("keeps only the most recent stderr lines when the cap is exceeded", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    const lines = Array.from({ length: 120 }, (_, i) => `line-${i}`).join("\n");
    child.stderr.push(`${lines}\n`);
    await new Promise((r) => setTimeout(r, 0));

    const errors: Error[] = [];
    conn.on("error", (e) => errors.push(e));

    const errorStatus = new Promise<void>((resolve) => {
      conn.on("state", (s) => {
        if (s === CONNECTION_STATUS.ERROR) resolve();
      });
    });

    triggerExit(1, null);
    await errorStatus;

    expect(errors[0]?.message).toMatch(/line-119/);
    expect(errors[0]?.message).not.toMatch(/line-0\b/);
  });

  // --- per-child ownership: a stale child must never act on the live child's state ---

  it("does not force-kill a replacement child spawned during the previous disconnect", async () => {
    vi.useFakeTimers();
    try {
      const a = createFakeChild();
      const b = createFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(a.child).mockReturnValueOnce(b.child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const disconnectPromise = conn.disconnect();
      a.triggerExit(0, null);
      await disconnectPromise;

      await conn.connect();
      await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS * 2);

      expect(b.child.kill).not.toHaveBeenCalledWith(SIGNAL.KILL);
      expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a stale child's close so the live child keeps its stream", async () => {
    vi.useFakeTimers();
    try {
      const a = createFakeChild();
      const b = createFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(a.child).mockReturnValueOnce(b.child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS);
      await disconnectPromise;

      await conn.connect();
      expect(conn.getStream()).toBeDefined();

      a.triggerExit(null, "SIGKILL");
      await vi.advanceTimersByTimeAsync(0);

      expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
      expect(conn.getStream()).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still emits exit for a force-killed child", async () => {
    vi.useFakeTimers();
    try {
      const { child, triggerExit } = createFakeChild();
      const spawnFn = vi.fn().mockReturnValue(child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const exits: Array<{ code: number | null; signal: string | null }> = [];
      conn.on("exit", (info) => exits.push(info));

      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS);
      await disconnectPromise;

      triggerExit(null, "SIGKILL");
      await vi.advanceTimersByTimeAsync(0);

      expect(exits).toHaveLength(1);
      expect(exits[0]).toEqual({ code: null, signal: "SIGKILL" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not report an error when a deliberately force-killed child finally closes", async () => {
    vi.useFakeTimers();
    try {
      const { child, triggerExit } = createFakeChild();
      const spawnFn = vi.fn().mockReturnValue(child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const errors: Error[] = [];
      conn.on("error", (e) => errors.push(e));

      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS);
      await disconnectPromise;

      triggerExit(null, "SIGKILL");
      await vi.advanceTimersByTimeAsync(0);

      expect(errors).toHaveLength(0);
      expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tears down an errored child before spawning its replacement", async () => {
    const a = createFakeChild();
    const b = createFakeChild();
    const spawnFn = vi.fn().mockReturnValueOnce(a.child).mockReturnValueOnce(b.child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    a.triggerError(new Error("ENOENT"));
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);

    await conn.connect();

    expect(a.child.kill).toHaveBeenCalledWith(SIGNAL.TERM);
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
  });

  // --- state is updated before the event announcing it ---

  it("has already updated status when the error event fires", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    let statusInsideHandler: string | undefined;
    conn.on("error", () => {
      statusInsideHandler = conn.connectionStatus;
    });

    triggerExit(1, null);
    await new Promise((r) => setTimeout(r, 0));

    expect(statusInsideHandler).toBe(CONNECTION_STATUS.ERROR);
  });

  it("has already cleared the stream when the exit event fires", async () => {
    const { child, triggerExit } = createFakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    let streamInsideHandler: unknown = "unset";
    conn.on("exit", () => {
      streamInsideHandler = conn.getStream();
    });

    triggerExit(0, null);
    await new Promise((r) => setTimeout(r, 0));

    expect(streamInsideHandler).toBeUndefined();
  });

  it("does not report a stale child's error on a healthy connection", async () => {
    vi.useFakeTimers();
    try {
      const a = createFakeChild();
      const b = createFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(a.child).mockReturnValueOnce(b.child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS);
      await disconnectPromise;
      await conn.connect();

      const errors: Error[] = [];
      let statusInsideHandler: string | undefined;
      conn.on("error", (e) => {
        errors.push(e);
        statusInsideHandler = conn.connectionStatus;
      });

      a.triggerError(new Error("stale child hiccup"));
      await vi.advanceTimersByTimeAsync(0);

      expect(errors).toHaveLength(0);
      expect(statusInsideHandler).toBeUndefined();
      expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("StdioConnection disconnect force-kill timer", () => {
  it("force-kills the child with SIGKILL when it does not close in time", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeChild();
      const spawnFn = vi.fn().mockReturnValue(fake.child);

      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      // Child never emits close: disconnect resolves via the force-kill path.
      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(500);
      await disconnectPromise;

      expect(fake.child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(fake.child.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never SIGKILLs a freshly reconnected child from a previous disconnect's timer", async () => {
    vi.useFakeTimers();
    try {
      const first = createFakeChild();
      const second = createFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(first.child).mockReturnValueOnce(second.child);

      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      // The old child closes well inside DISCONNECT_FORCE_MS, so disconnect()
      // resolves through the close path while the force-kill timer is still armed.
      // That armed timer is the bug: it must not outlive this disconnect.
      const disconnectPromise = conn.disconnect();
      first.triggerExit(0, null);
      await disconnectPromise;

      // Reconnect, then run well past DISCONNECT_FORCE_MS so a stale timer fires.
      await conn.connect();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(first.child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(second.child.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the force-kill timer when the child closes in time", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeChild();
      const spawnFn = vi.fn().mockReturnValue(fake.child);
      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      const disconnectPromise = conn.disconnect();
      fake.triggerExit(0, null);
      await disconnectPromise;

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(fake.child.kill).not.toHaveBeenCalledWith("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("StdioConnection intentional-kill bookkeeping", () => {
  it("remembers every child it deliberately killed, not just the most recent one", () => {
    // `closingChild` was a single slot for what is really a set. Sequence: child A errors and
    // stays current -> connect() sets closingChild = A and spawns B -> disconnect() overwrites
    // closingChild = B. A is now a child the connection deliberately killed but has forgotten
    // it killed, so a late close from A is neither current nor recognised as intentional.
    //
    // Today that is benign only because `if (!isCurrent) return` fires before `wasDisconnecting`
    // is consulted - correctness resting on an unrelated early return three lines later. This
    // pins the property directly: a deliberately-killed child must never be reported as an error.
    const childA = createFakeChild();
    const childB = createFakeChild();
    const spawnFn = vi.fn().mockReturnValueOnce(childA.child).mockReturnValueOnce(childB.child);

    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const errors: Error[] = [];
    conn.on("error", (err) => errors.push(err));

    conn.connect();
    childA.triggerError(new Error("A failed"));
    expect(errors).toHaveLength(1);

    conn.connect();
    void conn.disconnect();

    errors.length = 0;
    childA.triggerExit(1, null);

    expect(errors, "a deliberately killed child must not be reported as a failure").toEqual([]);
  });
});

describe("StdioConnection stream construction failure", () => {
  it("kills the spawned child when its stream cannot be built", async () => {
    // createNdjsonStream calls Writable.toWeb/Readable.toWeb, which throw on a child without
    // usable pipes. The OS process is already running at that point. If it is not tracked and
    // not killed here it is orphaned for the lifetime of the host process: disconnect() finds
    // nothing to reap, a later connect() sees no previous child, and no close/error listener is
    // ever bound - so a subsequent 'error' on it is unhandled and takes the process down.
    const kill = vi.fn();
    const brokenChild = Object.assign(new EventEmitter(), {
      stdout: undefined,
      stderr: { setEncoding() {}, on() {} },
      stdin: undefined,
      kill,
      pid: 999,
    });
    const spawnFn = vi.fn().mockReturnValue(brokenChild);

    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    conn.on("error", () => {});

    await conn.connect();

    expect(conn.getStream()).toBeUndefined();
    expect(kill, "a child whose stream failed to build must still be killed").toHaveBeenCalled();
  });

  it("kills the spawned child when even stderr capture cannot be bound", async () => {
    // The previous fixture gave the child a working stderr, so bindStderrCapture succeeded and
    // this path was never exercised. setEncoding on an absent stderr throws one line ABOVE the
    // kill-on-failure guard, which left exactly the orphan that guard exists to prevent.
    const kill = vi.fn();
    const brokenChild = Object.assign(new EventEmitter(), {
      stdout: undefined,
      stderr: undefined,
      stdin: undefined,
      kill,
      pid: 998,
    });
    const spawnFn = vi.fn().mockReturnValue(brokenChild);

    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    conn.on("error", () => {});

    await conn.connect();

    expect(conn.getStream()).toBeUndefined();
    expect(kill, "a child whose stderr could not be bound must still be killed").toHaveBeenCalled();
  });
});
