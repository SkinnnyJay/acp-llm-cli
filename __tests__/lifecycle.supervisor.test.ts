import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PORT_CAPABILITY } from "../src/domain/port.capabilities";
import type { IAgentPort } from "../src/runtime/agent.port";
import {
  LifecycleAgentPort,
  wrapAgentPortWithLifecycle,
} from "../src/runtime/lifecycle.supervisor";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";

function createMockPort(): IAgentPort {
  const emitter = new EventEmitter();
  let status = CONNECTION_STATUS.DISCONNECTED;
  const port = {
    get connectionStatus() {
      return status;
    },
    connect: vi.fn().mockImplementation(async () => {
      status = CONNECTION_STATUS.CONNECTED;
      emitter.emit("state", status);
    }),
    disconnect: vi.fn().mockImplementation(async () => {
      status = CONNECTION_STATUS.DISCONNECTED;
      emitter.emit("state", status);
    }),
    initialize: vi.fn().mockResolvedValue({ protocolVersion: "1", agentCapabilities: {} }),
    newSession: vi.fn().mockResolvedValue({ sessionId: "sess-123" }),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    authenticate: vi.fn().mockResolvedValue({}),
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockImplementation(async () => {
      await port.disconnect();
      await port.connect();
      await port.initialize();
    }),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
  return port as unknown as IAgentPort;
}

describe("wrapAgentPortWithLifecycle", () => {
  it("adds restart, openClose, and sessionPersistence capabilities when persistence provided", () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "test-provider",
    });

    expect(wrapped.capabilities).toBeDefined();
    expect(wrapped.capabilities?.[PORT_CAPABILITY.RESTART]).toBe(true);
    expect(wrapped.capabilities?.[PORT_CAPABILITY.OPEN_CLOSE]).toBe(true);
    expect(wrapped.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(true);
  });

  it("sets sessionPersistence capability to false when no persistence", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      providerId: "test-provider",
    });

    expect(wrapped.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(false);
  });

  it("saves session when newSession returns sessionId", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "claude-cli",
    });

    await wrapped.newSession({ cwd: "/tmp", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);

    const loaded = await persistence.loadSession("claude-cli");
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe("sess-123");
  });

  it("does not save session when newSession returns an empty sessionId", async () => {
    const inner = createMockPort();
    (inner.newSession as ReturnType<typeof vi.fn>).mockResolvedValue({ sessionId: "" });
    const persistence = createMemorySessionPersistence();
    const saveSpy = vi.spyOn(persistence, "saveSession");
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "claude-cli",
    });

    await wrapped.newSession({ cwd: "/tmp", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("delegates open to connect and close to disconnect", async () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });

    await wrapped.open?.();
    expect(inner.connect).toHaveBeenCalled();

    await wrapped.close?.();
    expect(inner.disconnect).toHaveBeenCalled();
  });

  it("is a named class (not anonymous)", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    expect(wrapped.constructor.name).toBe("LifecycleAgentPort");
  });

  it("can be instantiated directly as LifecycleAgentPort", () => {
    const inner = createMockPort();
    const port = new LifecycleAgentPort(inner, { providerId: "test" });
    expect(port).toBeInstanceOf(LifecycleAgentPort);
  });

  it("delegates connect, disconnect, initialize, prompt, authenticate to inner", async () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });

    await wrapped.connect();
    await wrapped.disconnect();
    await wrapped.initialize();
    await wrapped.prompt({ sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0]);
    await wrapped.authenticate({} as Parameters<IAgentPort["authenticate"]>[0]);

    expect(inner.connect).toHaveBeenCalledOnce();
    expect(inner.disconnect).toHaveBeenCalledOnce();
    expect(inner.initialize).toHaveBeenCalledOnce();
    expect(inner.prompt).toHaveBeenCalledOnce();
    expect(inner.authenticate).toHaveBeenCalledOnce();
  });

  it("forwards state, error, sessionUpdate, permissionRequest events from inner", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });

    const stateEvents: unknown[] = [];
    const errorEvents: unknown[] = [];
    const sessionUpdateEvents: unknown[] = [];
    const permissionEvents: unknown[] = [];

    wrapped.on("state", (s) => stateEvents.push(s));
    wrapped.on("error", (e) => errorEvents.push(e));
    wrapped.on("sessionUpdate", (u) => sessionUpdateEvents.push(u));
    wrapped.on("permissionRequest", (r) => permissionEvents.push(r));

    (inner as unknown as EventEmitter).emit("state", CONNECTION_STATUS.CONNECTED);
    (inner as unknown as EventEmitter).emit("error", new Error("inner error"));
    (inner as unknown as EventEmitter).emit("sessionUpdate", { sessionId: "s1", update: {} });
    (inner as unknown as EventEmitter).emit("permissionRequest", { sessionId: "s1" });

    expect(stateEvents).toEqual([CONNECTION_STATUS.CONNECTED]);
    expect(errorEvents).toHaveLength(1);
    expect(sessionUpdateEvents).toHaveLength(1);
    expect(permissionEvents).toHaveLength(1);
  });

  it("saves session on sessionUpdate when persistence and session_id are present", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "gemini-cli",
    });

    await wrapped.sessionUpdate({
      sessionId: "s1",
      update: {},
      session_id: "sess-from-update",
    } as unknown as Parameters<IAgentPort["sessionUpdate"]>[0]);

    const saved = await persistence.loadSession("gemini-cli");
    expect(saved?.sessionId).toBe("sess-from-update");
    expect(inner.sessionUpdate).toHaveBeenCalled();
  });

  it("does not save session on sessionUpdate when no persistence", async () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    await wrapped.sessionUpdate({
      sessionId: "s1",
      update: {},
      session_id: "should-not-save",
    } as unknown as Parameters<IAgentPort["sessionUpdate"]>[0]);
    expect(inner.sessionUpdate).toHaveBeenCalledOnce();
  });

  it("does not save session when session_id is missing from sessionUpdate", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const saveSpy = vi.spyOn(persistence, "saveSession");
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "test",
    });

    await wrapped.sessionUpdate({
      sessionId: "s1",
      update: {},
    } as Parameters<IAgentPort["sessionUpdate"]>[0]);

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("restart() calls inner.restart and resumes saved session when resumeOnRestart is true", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    await persistence.saveSession({
      providerId: "claude-cli",
      sessionId: "saved-sess",
      updatedAt: Date.now(),
    });

    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "claude-cli",
      resumeOnRestart: true,
      restartOptions: { maxRetries: 1, backoffBaseMs: 0, backoffCapMs: 0 },
    });

    await wrapped.restart?.();

    expect(inner.restart).toHaveBeenCalled();
    expect(inner.newSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "saved-sess" })
    );
  });

  it("restart() does not call newSession when no persisted session exists", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "claude-cli",
      resumeOnRestart: true,
      restartOptions: { maxRetries: 1, backoffBaseMs: 0, backoffCapMs: 0 },
    });

    await wrapped.restart?.();

    expect(inner.restart).toHaveBeenCalled();
    expect(inner.newSession).not.toHaveBeenCalled();
  });

  it("restart() skips session resume when resumeOnRestart is false", async () => {
    const inner = createMockPort();
    const persistence = createMemorySessionPersistence();
    await persistence.saveSession({
      providerId: "claude-cli",
      sessionId: "saved-sess",
      updatedAt: Date.now(),
    });

    const wrapped = wrapAgentPortWithLifecycle(inner, {
      sessionPersistence: persistence,
      providerId: "claude-cli",
      resumeOnRestart: false,
      restartOptions: { maxRetries: 1, backoffBaseMs: 0, backoffCapMs: 0 },
    });

    await wrapped.restart?.();

    expect(inner.restart).toHaveBeenCalled();
    expect(inner.newSession).not.toHaveBeenCalled();
  });

  it("streamPrompt yields from inner.streamPrompt when supported", async () => {
    const inner = createMockPort();
    const envelopes = [{ kind: "native", update: { sessionId: "s1", update: {} } }];
    (inner as { streamPrompt: unknown }).streamPrompt = vi
      .fn()
      .mockImplementation(async function* () {
        yield* envelopes;
      });
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    const out: unknown[] = [];
    for await (const env of wrapped.streamPrompt(params)) {
      out.push(env);
    }
    expect(out).toEqual(envelopes);
  });

  it("streamPrompt throws STREAM_PROMPT_NOT_SUPPORTED when inner has no streamPrompt", async () => {
    const inner = createMockPort();
    const wrapped = new LifecycleAgentPort(inner, { providerId: "test" });
    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];

    await expect(async () => {
      for await (const _ of wrapped.streamPrompt(params)) {
        // consume
      }
    }).rejects.toThrow(ERROR_MESSAGE.STREAM_PROMPT_NOT_SUPPORTED);
  });

  it("connectionStatus reflects inner port status", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    expect(wrapped.connectionStatus).toBe(inner.connectionStatus);
  });

  it("initialize delegates to inner port", async () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    const result = await wrapped.initialize({ protocolVersion: "1" } as Parameters<
      typeof wrapped.initialize
    >[0]);
    expect(inner.initialize).toHaveBeenCalled();
    expect(result).toMatchObject({ protocolVersion: "1" });
  });

  it("setSessionMode getter returns bound method from inner when present", () => {
    const inner = createMockPort();
    const modeFn = vi.fn();
    (inner as Record<string, unknown>).setSessionMode = modeFn;
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    const getter = wrapped.setSessionMode;
    expect(typeof getter).toBe("function");
  });

  it("setSessionMode getter returns undefined when inner has no setSessionMode", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    const getter = wrapped.setSessionMode;
    expect(getter).toBeUndefined();
  });

  it("setSessionModel getter returns bound method from inner when present", () => {
    const inner = createMockPort();
    const modelFn = vi.fn();
    (inner as Record<string, unknown>).setSessionModel = modelFn;
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    const getter = wrapped.setSessionModel;
    expect(typeof getter).toBe("function");
  });

  it("setSessionModel getter returns undefined when inner has no setSessionModel", () => {
    const inner = createMockPort();
    const wrapped = wrapAgentPortWithLifecycle(inner, { providerId: "test" });
    const getter = wrapped.setSessionModel;
    expect(getter).toBeUndefined();
  });
});
