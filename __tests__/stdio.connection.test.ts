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
});
