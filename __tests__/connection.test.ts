import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { StdioConnection } from "../src/runtime/stdio.connection";

describe("StdioConnection", () => {
  it("starts disconnected", () => {
    const conn = new StdioConnection({
      command: "echo",
      args: ["hello"],
    });
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    expect(conn.getStream()).toBeUndefined();
  });

  it("accepts custom spawn function for tests", () => {
    const spawnFn = vi.fn();
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    expect(conn).toBeDefined();
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
