import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { CURSOR_CLI_ARG, CURSOR_CLI_SUBCOMMAND } from "../src/providers/cursor/constants";
import { CursorAgentPort } from "../src/providers/cursor/cursor.agent.port";
import { createFakeChild } from "./helpers/fake.child.process";

const SESSION_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("CursorAgentPort spawn contract", () => {
  it("health-check connect succeeds and omits --trust by default", async () => {
    const spawnCalls: { command: string; args: string[] }[] = [];
    const spawnFn = vi.fn().mockImplementation((command: string, args: string[]) => {
      spawnCalls.push({ command, args });
      return createFakeChild({ exitCode: 0, stdout: "ok\n" }).child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );

    await port.connect();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
    expect(spawnCalls[0]?.args).toContain(CURSOR_CLI_ARG.PRINT);
    expect(spawnCalls[0]?.args).not.toContain(CURSOR_CLI_ARG.TRUST);
  });

  it("adds --trust only when config.trust is true", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      expect(args).toContain(CURSOR_CLI_ARG.TRUST);
      return createFakeChild({ exitCode: 0 }).child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {}, trust: true },
      { spawnFn: spawnFn }
    );
    await port.connect();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
  });

  it("newSession extracts UUID session id", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      if (args.includes(CURSOR_CLI_SUBCOMMAND.CREATE_CHAT)) {
        return createFakeChild({ stdout: `Created ${SESSION_UUID}\n`, exitCode: 0 }).child;
      }
      return createFakeChild({ exitCode: 0 }).child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );
    await port.connect();
    const session = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    expect(session.sessionId).toBe(SESSION_UUID);
  });

  it("prompt builds argv and parses NDJSON result", async () => {
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      if (args.includes(CURSOR_CLI_SUBCOMMAND.CREATE_CHAT)) {
        return createFakeChild({ stdout: SESSION_UUID, exitCode: 0 }).child;
      }
      if (args.includes("hello")) {
        expect(args).toContain(CURSOR_CLI_ARG.RESUME);
        expect(args).toContain(SESSION_UUID);
        expect(args).not.toContain(CURSOR_CLI_ARG.TRUST);
        const ndjson = JSON.stringify({
          type: "result",
          subtype: "success",
          result: "world",
          session_id: SESSION_UUID,
        });
        return createFakeChild({ stdout: `${ndjson}\n`, exitCode: 0 }).child;
      }
      return createFakeChild({ exitCode: 0 }).child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );
    await port.connect();
    await port.newSession({ cwd: "/tmp", mcpServers: [] });
    const res = await port.prompt({
      sessionId: SESSION_UUID,
      prompt: [{ type: "text", text: "hello" }],
    });
    expect(res.stopReason).toBe("end_turn");
    expect(res).toMatchObject({ content: [{ type: "text", text: "world" }] });
  });

  it("throws when NDJSON result is missing", async () => {
    const spawnFn = vi
      .fn()
      .mockImplementation(() => createFakeChild({ stdout: "not-json\n", exitCode: 0 }).child);
    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );
    await port.connect();
    await expect(
      port.prompt({
        sessionId: "s1",
        prompt: [{ type: "text", text: "hi" }],
      })
    ).rejects.toThrow(ERROR_MESSAGE.CURSOR_RESULT_MISSING);
  });

  it("disconnect aborts in-flight spawn work", async () => {
    let spawnCount = 0;
    let hangingKill: ReturnType<typeof vi.fn> | undefined;
    const spawnFn = vi.fn().mockImplementation(() => {
      spawnCount++;
      if (spawnCount === 1) {
        return createFakeChild({ exitCode: 0 }).child;
      }
      const handle = createFakeChild({ hang: true, pid: 7 });
      hangingKill = handle.child.kill;
      return handle.child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );
    await port.connect();

    const promptPromise = port.prompt({
      sessionId: "s1",
      prompt: [{ type: "text", text: "hang" }],
    });
    const promptExpectation = expect(promptPromise).rejects.toThrow(/aborted/i);

    await new Promise((r) => setTimeout(r, 10));
    await port.disconnect();

    await promptExpectation;
    expect(hangingKill).toHaveBeenCalled();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("routes a prompt to its own session, not the most recently created chat", async () => {
    const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const chats = [UUID_A, UUID_B];
    const promptArgs: string[][] = [];

    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      if (args.includes(CURSOR_CLI_SUBCOMMAND.CREATE_CHAT)) {
        return createFakeChild({ stdout: `Created ${chats.shift()}\n`, exitCode: 0 }).child;
      }
      if (args.includes("hello")) {
        promptArgs.push(args);
        const ndjson = JSON.stringify({
          type: "result",
          subtype: "success",
          result: "ok",
          session_id: UUID_A,
        });
        return createFakeChild({ stdout: `${ndjson}\n`, exitCode: 0 }).child;
      }
      return createFakeChild({ exitCode: 0 }).child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );

    const a = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    const b = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    expect(a.sessionId).toBe(UUID_A);
    expect(b.sessionId).toBe(UUID_B);

    await port.setSessionMode?.({ sessionId: a.sessionId, modeId: "read-only" });
    await port.prompt({
      sessionId: a.sessionId,
      prompt: [{ type: "text", text: "hello" }],
    });

    const args = promptArgs[0] ?? [];
    expect(args[args.indexOf(CURSOR_CLI_ARG.RESUME) + 1]).toBe(UUID_A);
    expect(args[args.indexOf(CURSOR_CLI_ARG.MODE) + 1]).toBe("ask");
  });

  it("does not leak one session's mode into another session's argv", async () => {
    const UUID_A = "11111111-1111-4111-8111-111111111111";
    const UUID_B = "22222222-2222-4222-8222-222222222222";
    const chats = [UUID_A, UUID_B];
    const promptArgs: string[][] = [];

    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      if (args.includes(CURSOR_CLI_SUBCOMMAND.CREATE_CHAT)) {
        return createFakeChild({ stdout: `Created ${chats.shift()}\n`, exitCode: 0 }).child;
      }
      if (args.includes("hi")) {
        promptArgs.push(args);
        const ndjson = JSON.stringify({ type: "result", subtype: "success", result: "ok" });
        return createFakeChild({ stdout: `${ndjson}\n`, exitCode: 0 }).child;
      }
      return createFakeChild({ exitCode: 0 }).child;
    });

    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );

    const a = await port.newSession({ cwd: "/tmp", mcpServers: [] });
    const b = await port.newSession({ cwd: "/tmp", mcpServers: [] });

    await port.setSessionMode?.({ sessionId: a.sessionId, modeId: "read-only" });
    await port.prompt({ sessionId: b.sessionId, prompt: [{ type: "text", text: "hi" }] });

    const args = promptArgs[0] ?? [];
    expect(args[args.indexOf(CURSOR_CLI_ARG.RESUME) + 1]).toBe(UUID_B);
    expect(args).not.toContain(CURSOR_CLI_ARG.MODE);
  });

  it("is idempotent when disconnect is called concurrently", async () => {
    const spawnFn = vi.fn().mockImplementation(() => createFakeChild({ exitCode: 0 }).child);
    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );
    const states: string[] = [];
    port.on("state", (s) => states.push(s));

    await Promise.all([port.disconnect(), port.disconnect()]);

    expect(states.filter((s) => s === CONNECTION_STATUS.DISCONNECTED)).toHaveLength(1);
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("rejects newSession issued while a disconnect is in progress", async () => {
    const hanging = createFakeChild({ hang: true });
    const spawnFn = vi.fn().mockReturnValue(hanging.child);
    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );

    const inflight = port
      .prompt({ sessionId: "s1", prompt: [{ type: "text", text: "hi" }] })
      .catch((err: Error) => err);
    await new Promise((r) => setTimeout(r, 0));

    const disconnecting = port.disconnect();
    await expect(port.newSession({ cwd: "/tmp", mcpServers: [] })).rejects.toThrow(
      ERROR_MESSAGE.CURSOR_DISCONNECT_IN_PROGRESS
    );

    await disconnecting;
    await inflight;
    expect(hanging.child.kill).toHaveBeenCalled();
  });

  it("allows connect again after disconnect so restart works", async () => {
    const spawnFn = vi.fn().mockImplementation(() => createFakeChild({ exitCode: 0 }).child);
    const port = new CursorAgentPort(
      { command: "cursor-agent", args: [], env: {} },
      { spawnFn: spawnFn }
    );

    await port.connect();
    await port.disconnect();
    await port.connect();

    expect(port.connectionStatus).toBe(CONNECTION_STATUS.CONNECTED);
  });

  it("health-checks the same binary and args a prompt will use", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const spawnFn = vi.fn().mockImplementation((command: string, args: string[]) => {
      calls.push({ command, args });
      if (args.includes("hi")) {
        const ndjson = JSON.stringify({ type: "result", subtype: "success", result: "ok" });
        return createFakeChild({ stdout: `${ndjson}\n`, exitCode: 0 }).child;
      }
      return createFakeChild({ exitCode: 0 }).child;
    });

    const port = new CursorAgentPort(
      { command: "/custom/path/cursor-agent", args: ["--flag"], env: {} },
      { spawnFn: spawnFn }
    );

    await port.connect();
    await port.prompt({ sessionId: "s1", prompt: [{ type: "text", text: "hi" }] });

    expect(calls[0]?.command).toBe("/custom/path/cursor-agent");
    expect(calls[0]?.args).toContain("--flag");
    expect(calls.at(-1)?.command).toBe("/custom/path/cursor-agent");
  });
});
