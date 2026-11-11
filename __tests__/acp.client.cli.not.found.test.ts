import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { AgentProcessError, ConnectionError } from "../src/domain/errors";
import { PROVIDER_SETUP } from "../src/domain/provider.setup";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import { createAcpCliHarnessRuntime } from "../src/runtime/acp.runtime";
import type { IAgentPort } from "../src/runtime/agent.port";
import { type SpawnFunction, StdioConnection } from "../src/runtime/stdio.connection";

/**
 * A missing agent binary, spawned for real. On Node 22 spawn() returns a child without a pid and
 * reports ENOENT on its `error` event a tick later. The transport waits for `spawn` or `error`
 * before it reports CONNECTED, so connect() itself rejects with the typed error - the path a
 * caller actually awaits - and the port emits it exactly once on `error`.
 */

const MISSING = "acp-llm-cli-definitely-missing-binary";
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const rejectionOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error
  );

describe("a missing agent CLI", () => {
  let port: IAgentPort | undefined;

  afterEach(async () => {
    await port?.disconnect().catch(() => undefined);
    port = undefined;
  });

  it("makes connect() reject with CLI_NOT_FOUND and the install hint, with no error listener", async () => {
    port = createAcpCliHarnessRuntime(
      { command: MISSING, args: [], env: {} },
      { providerId: "cursor-cli" }
    );

    const error = await rejectionOf(port.connect());

    expect(error).toBeInstanceOf(AgentProcessError);
    const typed = error as AgentProcessError;
    expect(typed.code).toBe("CLI_NOT_FOUND");
    expect(typed.subsystem).toBe("process");
    expect(typed.command).toBe(MISSING);
    expect(typed.providerId).toBe("cursor-cli");
    expect(typed.hint).toContain(PROVIDER_SETUP["cursor-cli"].install);
    expect(typed.message).toContain(MISSING);
    expect(typed.message).toContain(PROVIDER_SETUP["cursor-cli"].install);
    expect((typed.cause as NodeJS.ErrnoException).code).toBe("ENOENT");
  });

  it("emits exactly one error event, passes through the error state, and later calls are not connected", async () => {
    port = createAcpCliHarnessRuntime(
      { command: MISSING, args: [], env: {} },
      { providerId: "cursor-cli" }
    );
    const emitted: Error[] = [];
    const states: string[] = [];
    port.on("error", (error) => emitted.push(error));
    port.on("state", (state) => states.push(state));

    const rejection = await rejectionOf(port.connect());
    await settle(200);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBeInstanceOf(AgentProcessError);
    expect((emitted[0] as AgentProcessError).code).toBe("CLI_NOT_FOUND");
    expect(emitted[0]).toBe(rejection);
    // The transport reports ERROR; connect()'s existing no-stream branch then disconnects it so
    // nothing is left behind, which ends in DISCONNECTED.
    expect(states).toEqual([
      CONNECTION_STATUS.CONNECTING,
      CONNECTION_STATUS.ERROR,
      CONNECTION_STATUS.DISCONNECTED,
    ]);
    expect(port.connectionStatus).not.toBe(CONNECTION_STATUS.CONNECTED);
    const later = await rejectionOf(port.initialize());
    expect(later).toBeInstanceOf(ConnectionError);
    expect((later as ConnectionError).code).toBe("NOT_CONNECTED");
  });

  it("gives a provider not in PROVIDER_SETUP the same class and no hint", async () => {
    port = createAcpCliHarnessRuntime(
      { command: MISSING, args: [], env: {} },
      { providerId: "my-custom-agent" }
    );

    const error = (await rejectionOf(port.connect())) as AgentProcessError;

    expect(error).toBeInstanceOf(AgentProcessError);
    expect(error.code).toBe("CLI_NOT_FOUND");
    expect(error.providerId).toBe("my-custom-agent");
    expect(error.hint).toBeUndefined();
  });

  it("makes restart() reject instead of resolving", async () => {
    port = createAcpCliHarnessRuntime(
      { command: MISSING, args: [], env: {} },
      { providerId: "cursor-cli", restartOptions: { maxRetries: 1, backoffBaseMs: 0 } }
    );

    const error = await rejectionOf(port.restart?.() ?? Promise.resolve());

    expect(error).toBeInstanceOf(AgentProcessError);
    expect((error as AgentProcessError).code).toBe("CLI_NOT_FOUND");
  });

  it("rejects connect() with SPAWN_FAILED naming the directory when the cwd does not exist", async () => {
    const cwd = join(tmpdir(), "acp-llm-cli-missing-dir", "nope");
    port = createAcpCliHarnessRuntime(
      { command: process.execPath, args: [], env: {}, cwd },
      { providerId: "cursor-cli" }
    );

    const error = (await rejectionOf(port.connect())) as AgentProcessError;

    expect(error).toBeInstanceOf(AgentProcessError);
    expect(error.code).toBe("SPAWN_FAILED");
    expect(error.message).toContain(cwd);
    expect(error.hint).toBeUndefined();
  });

  it("rejects connect() with CLI_NOT_EXECUTABLE for a file that is not executable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "acp-llm-cli-"));
    const file = join(dir, "not-executable");
    writeFileSync(file, "#!/bin/sh\n", { mode: 0o644 });
    try {
      port = createAcpCliHarnessRuntime(
        { command: file, args: [], env: {} },
        { providerId: "cursor-cli" }
      );

      const error = (await rejectionOf(port.connect())) as AgentProcessError;

      expect(error).toBeInstanceOf(AgentProcessError);
      expect(error.code).toBe("CLI_NOT_EXECUTABLE");
      expect(error.command).toBe(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes connect() reject with it when the spawn throws ENOENT synchronously", async () => {
    const throwingSpawn: SpawnFunction = (command) => {
      throw Object.assign(new Error(`spawn ${command} ENOENT`), {
        code: "ENOENT",
        syscall: `spawn ${command}`,
      });
    };
    const connection = new StdioConnection({ command: MISSING, args: [] }, throwingSpawn);
    port = createAcpAgentPort(connection, { providerId: "codex-cli", command: MISSING });
    const emitted: Error[] = [];
    port.on("error", (error) => emitted.push(error));

    const rejection = await port.connect().then(
      () => undefined,
      (error: unknown) => error
    );

    expect(rejection).toBeInstanceOf(AgentProcessError);
    const typed = rejection as AgentProcessError;
    expect(typed.code).toBe("CLI_NOT_FOUND");
    expect(typed.command).toBe(MISSING);
    expect(typed.providerId).toBe("codex-cli");
    expect(typed.message).toContain(PROVIDER_SETUP["codex-cli"].install);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBe(typed);
  });

  it("classifies EACCES and other spawn failures from the transport", async () => {
    const failWith =
      (code: string): SpawnFunction =>
      (command) => {
        throw Object.assign(new Error(`spawn ${command} ${code}`), { code });
      };
    const seen: AgentProcessError[] = [];
    for (const nodeCode of ["EACCES", "EMFILE"]) {
      const connection = new StdioConnection({ command: MISSING, args: [] }, failWith(nodeCode));
      connection.on("error", (error) => seen.push(error as AgentProcessError));
      await connection.connect();
    }

    expect(seen.map((error) => error.code)).toEqual(["CLI_NOT_EXECUTABLE", "SPAWN_FAILED"]);
    expect(seen.every((error) => error instanceof AgentProcessError)).toBe(true);
    expect(seen.map((error) => error.message)).toEqual([
      `spawn ${MISSING} EACCES`,
      `spawn ${MISSING} EMFILE`,
    ]);
    expect(seen[0]?.command).toBe(MISSING);
  });
});
