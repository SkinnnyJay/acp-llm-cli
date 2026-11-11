import { afterEach, describe, expect, it } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { AgentProcessError } from "../src/domain/errors";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import type { IAgentPort } from "../src/runtime/agent.port";
import { StdioConnection } from "../src/runtime/stdio.connection";

/**
 * A real child that answers `initialize`, then writes to stderr and exits 3.
 *
 * Its stdout EOF reaches the SDK before the child's `close` event reaches the transport. The
 * client must not react to the SDK closing the link in a way that pre-empts the transport's
 * crash report (exit code + stderr tail + `error` state).
 */
const CRASHING_AGENT = `
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\\n");
  while (newline >= 0) {
    const message = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf("\\n");
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: { protocolVersion: 1, agentCapabilities: {} },
      }) + "\\n", () => {
        process.stderr.write("agent boom: out of tea\\n", () => process.exit(3));
      });
    }
  }
});
`;

describe("StdioConnection + ACPClient with a real crashing child", () => {
  let port: IAgentPort | undefined;

  afterEach(async () => {
    // Reaps the child if a failing test left it running; a no-op once it has exited.
    await port?.disconnect().catch(() => undefined);
    port = undefined;
  });

  it("reports the crash once, with exit code and stderr, and ends in the error state", async () => {
    const connection = new StdioConnection({
      command: process.execPath,
      args: ["-e", CRASHING_AGENT],
    });
    port = createAcpAgentPort(connection);
    const errors: Error[] = [];
    const states: string[] = [];
    port.on("error", (error) => errors.push(error));
    port.on("state", (state) => states.push(state));
    const exited = new Promise<void>((resolve) => connection.on("exit", () => resolve()));

    await port.connect();
    await port.initialize();
    await exited;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("exited with code 3");
    expect(errors[0]?.message).toContain("agent boom: out of tea");
    expect(errors[0]).toBeInstanceOf(AgentProcessError);
    const typed = errors[0] as AgentProcessError;
    expect(typed.code).toBe("PROCESS_EXITED");
    expect(typed.exitCode).toBe(3);
    expect(typed.signal).toBeNull();
    expect(typed.stderr).toContain("agent boom: out of tea");
    expect(states.at(-1)).toBe(CONNECTION_STATUS.ERROR);
    expect(connection.connectionStatus).toBe(CONNECTION_STATUS.ERROR);
  });
});
