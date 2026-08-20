import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import { StdioConnection } from "../src/runtime/stdio.connection";
import { createFakeChild } from "./helpers/fake.child.process";

/**
 * The only tests that cross the transport/client boundary.
 *
 * The client decides whether an `exit` belongs to the process backing its current stream by
 * comparing getStream() against the stream it attached to. That works only because
 * StdioConnection clears its stream *before* announcing the exit. Each side is pinned in its own
 * suite, but nothing used to exercise them together - so reordering the transport's close
 * handler would have silently detached live connections with a green suite.
 */
describe("StdioConnection + ACPClient", () => {
  const spawnTwo = () => {
    // hang: true so neither child exits on its own - each test drives the exits it wants.
    const a = createFakeChild({ hang: true });
    const b = createFakeChild({ hang: true });
    const spawnFn = vi.fn().mockReturnValueOnce(a.child).mockReturnValueOnce(b.child);
    return { a, b, spawnFn };
  };

  it("keeps the link when a child abandoned by a reconnect finally exits", async () => {
    const { a, spawnFn } = spawnTwo();
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const port = createAcpAgentPort(conn);

    await port.connect();
    a.triggerError(new Error("ENOENT"));
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.ERROR);

    await port.connect();
    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);

    // The replaced child's close lands late; it must not detach the live child's link.
    a.triggerExit(null, "SIGTERM");
    await new Promise((r) => setTimeout(r, 0));

    expect(conn.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    expect(conn.getStream()).toBeDefined();
    // A detached port rejects immediately; an attached one waits on an agent that never replies.
    const settled = await Promise.race([
      port.newSession({ cwd: "/tmp", mcpServers: [] } as never).then(
        () => "resolved",
        (err: Error) => err.message
      ),
      new Promise((r) => setTimeout(() => r("still-pending"), 50)),
    ]);
    expect(settled).toBe("still-pending");
  });

  it("drops the link when the child backing the current stream exits", async () => {
    const { a, spawnFn } = spawnTwo();
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    const port = createAcpAgentPort(conn);

    await port.connect();
    a.triggerExit(1, null);
    await new Promise((r) => setTimeout(r, 0));

    expect(conn.getStream()).toBeUndefined();
    await expect(port.prompt({ sessionId: "s1", prompt: [] } as never)).rejects.toThrow(
      ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED
    );
  });

  it("clears the stream before announcing exit, which the client's ownership check relies on", async () => {
    const { a, spawnFn } = spawnTwo();
    const conn = new StdioConnection({ command: "fake", args: [] }, spawnFn);
    await conn.connect();

    let streamDuringExit: unknown = "unset";
    conn.on("exit", () => {
      streamDuringExit = conn.getStream();
    });

    a.triggerExit(0, null);
    await new Promise((r) => setTimeout(r, 0));

    expect(streamDuringExit).toBeUndefined();
  });
});
