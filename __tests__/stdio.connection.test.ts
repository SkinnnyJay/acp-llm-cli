import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
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
    const conn = new StdioConnection({ command: "fake" }, spawnFn);

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

    const exitEvents: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];
    conn.on("exit", (info) => exitEvents.push(info));

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
});

describe("StdioConnection disconnect force-kill timer", () => {
  it("never SIGKILLs a freshly reconnected child from a previous disconnect's timer", async () => {
    vi.useFakeTimers();
    try {
      const first = createFakeChild();
      const second = createFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(first.child).mockReturnValueOnce(second.child);

      const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
      await conn.connect();

      // Child never emits close: disconnect resolves via the force-kill path.
      const disconnectPromise = conn.disconnect();
      await vi.advanceTimersByTimeAsync(500);
      await disconnectPromise;
      expect(first.child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(first.child.kill).toHaveBeenCalledWith("SIGKILL");

      // Reconnect, then let any stale timers fire.
      await conn.connect();
      await vi.advanceTimersByTimeAsync(60_000);

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
