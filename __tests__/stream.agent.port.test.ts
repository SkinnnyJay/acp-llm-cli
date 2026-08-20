import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { ENVELOPE_MODE } from "../src/domain/envelope.mode";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { PORT_CAPABILITY } from "../src/domain/port.capabilities";
import { StreamAgentPort, wrapAgentPortWithStream } from "../src/runtime/acp.agent.port.stream";
import type { IAgentPort } from "../src/runtime/agent.port";
import { createMockAgentPort } from "./helpers/mock.agent.port";

const createMockPort = () => createMockAgentPort();

describe("StreamAgentPort", () => {
  it("is a named class (not anonymous)", () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    expect(port.constructor.name).toBe("StreamAgentPort");
  });

  it("exposes streamPrompt capability (restart/openClose owned by lifecycle)", () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    expect(port.capabilities[PORT_CAPABILITY.STREAM_PROMPT]).toBe(true);
    expect(port.capabilities[PORT_CAPABILITY.RESTART]).toBeUndefined();
    expect(port.capabilities[PORT_CAPABILITY.OPEN_CLOSE]).toBeUndefined();
  });

  it("delegates connect/disconnect/initialize/newSession/prompt/authenticate/sessionUpdate to inner", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    await port.connect();
    await port.disconnect();
    await port.initialize();
    await port.newSession({ cwd: "/tmp", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);
    await port.prompt({ sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0]);
    await port.authenticate({} as Parameters<IAgentPort["authenticate"]>[0]);
    await port.sessionUpdate({ sessionId: "s1", update: {} } as Parameters<
      IAgentPort["sessionUpdate"]
    >[0]);

    expect(inner.connect).toHaveBeenCalledOnce();
    expect(inner.disconnect).toHaveBeenCalledOnce();
    expect(inner.initialize).toHaveBeenCalledOnce();
    expect(inner.newSession).toHaveBeenCalledOnce();
    expect(inner.prompt).toHaveBeenCalledOnce();
    expect(inner.authenticate).toHaveBeenCalledOnce();
    expect(inner.sessionUpdate).toHaveBeenCalledOnce();
  });

  it("forwards state/error/sessionUpdate/permissionRequest events from inner", () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);

    const stateEvents: unknown[] = [];
    const errorEvents: unknown[] = [];
    const sessionUpdateEvents: unknown[] = [];
    const permissionEvents: unknown[] = [];

    port.on("state", (s) => stateEvents.push(s));
    port.on("error", (e) => errorEvents.push(e));
    port.on("sessionUpdate", (u) => sessionUpdateEvents.push(u));
    port.on("permissionRequest", (r) => permissionEvents.push(r));

    (inner as unknown as EventEmitter).emit("state", CONNECTION_STATUS.CONNECTED);
    (inner as unknown as EventEmitter).emit("error", new Error("boom"));
    (inner as unknown as EventEmitter).emit("sessionUpdate", { sessionId: "s1", update: {} });
    (inner as unknown as EventEmitter).emit("permissionRequest", { sessionId: "s1" });

    expect(stateEvents).toEqual([CONNECTION_STATUS.CONNECTED]);
    expect(errorEvents.length).toBe(1);
    expect(sessionUpdateEvents.length).toBe(1);
    expect(permissionEvents.length).toBe(1);
  });

  it("wrapAgentPortWithStream factory returns a StreamAgentPort instance", () => {
    const inner = createMockPort();
    const port = wrapAgentPortWithStream(inner);
    expect(port instanceof StreamAgentPort).toBe(true);
  });

  it("streamPrompt yields OpenAI and native envelopes on BOTH mode", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner, { envelopeMode: ENVELOPE_MODE.BOTH });

    const update = {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk" as const,
        content: { type: "text", text: "hello" },
      },
    };

    (inner.prompt as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      setTimeout(() => {
        (inner as unknown as EventEmitter).emit("sessionUpdate", update);
      }, 0);
      await new Promise((r) => setTimeout(r, 5));
      return { stopReason: "end_turn" };
    });

    const envelopes: unknown[] = [];
    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    for await (const env of port.streamPrompt(params)) {
      envelopes.push(env);
    }

    const hasNative = envelopes.some(
      (e) => "kind" in (e as object) && (e as { kind: string }).kind === "native"
    );
    const hasOpenAI = envelopes.some(
      (e) =>
        "object" in (e as object) && (e as { object: string }).object === "chat.completion.chunk"
    );
    expect(hasNative).toBe(true);
    expect(hasOpenAI).toBe(true);
  });

  it("streamPrompt emits a finish envelope at the end in OPENAI mode", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner, { envelopeMode: ENVELOPE_MODE.OPENAI });

    (inner.prompt as ReturnType<typeof vi.fn>).mockResolvedValue({ stopReason: "end_turn" });

    const envelopes: unknown[] = [];
    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    for await (const env of port.streamPrompt(params)) {
      envelopes.push(env);
    }

    const lastEnvelope = envelopes.at(-1) as
      | { choices?: Array<{ finish_reason: string | null }> }
      | undefined;
    expect(lastEnvelope?.choices?.[0]?.finish_reason).toBe("stop");
  });

  it("streamPrompt propagates inner prompt rejection", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    (inner.prompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("prompt failed"));

    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    await expect(async () => {
      for await (const _ of port.streamPrompt(params)) {
        // consume
      }
    }).rejects.toThrow("prompt failed");
  });

  it("connectionStatus reflects the inner port", () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("setSessionMode and setSessionConfigOption getters bind inner methods when present", () => {
    const inner = createMockPort();
    const modeFn = vi.fn();
    const modelFn = vi.fn();
    (inner as Record<string, unknown>).setSessionMode = modeFn;
    (inner as Record<string, unknown>).setSessionConfigOption = modelFn;
    const port = new StreamAgentPort(inner);
    expect(typeof port.setSessionMode).toBe("function");
    expect(typeof port.setSessionConfigOption).toBe("function");
  });

  it("setSessionMode and setSessionConfigOption getters are undefined when inner lacks them", () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    expect(port.setSessionMode).toBeUndefined();
    expect(port.setSessionConfigOption).toBeUndefined();
  });

  it("streamPrompt in NATIVE mode does not emit an OpenAI finish envelope", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner, { envelopeMode: ENVELOPE_MODE.NATIVE });
    (inner.prompt as ReturnType<typeof vi.fn>).mockResolvedValue({ stopReason: "end_turn" });

    const envelopes: unknown[] = [];
    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    for await (const env of port.streamPrompt(params)) {
      envelopes.push(env);
    }

    expect(
      envelopes.some(
        (e) =>
          "object" in (e as object) && (e as { object: string }).object === "chat.completion.chunk"
      )
    ).toBe(false);
  });

  it("streamPrompt rethrows non-Error rejection values", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    (inner.prompt as ReturnType<typeof vi.fn>).mockRejectedValue("string-fail");

    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    await expect(async () => {
      for await (const _ of port.streamPrompt(params)) {
        // consume
      }
    }).rejects.toBe("string-fail");
  });

  it("filters sessionUpdate events for other session ids", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner, { envelopeMode: ENVELOPE_MODE.NATIVE });

    (inner.prompt as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      setTimeout(() => {
        (inner as unknown as EventEmitter).emit("sessionUpdate", {
          sessionId: "other",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "skip" },
          },
        });
        (inner as unknown as EventEmitter).emit("sessionUpdate", {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "keep" },
          },
        });
      }, 0);
      await new Promise((r) => setTimeout(r, 10));
      return { stopReason: "end_turn" };
    });

    const texts: string[] = [];
    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    for await (const env of port.streamPrompt(params)) {
      const native = env as {
        kind?: string;
        update?: { update?: { content?: { text?: string } } };
      };
      if (native.kind === "native") {
        const text = native.update?.update?.content?.text;
        if (text) texts.push(text);
      }
    }
    expect(texts).toEqual(["keep"]);
  });

  it("rejects concurrent streamPrompt calls on the same port", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);

    let releasePrompt!: () => void;
    const promptGate = new Promise<void>((r) => {
      releasePrompt = r;
    });
    (inner.prompt as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await promptGate;
      return { stopReason: "end_turn" };
    });

    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    const first = (async () => {
      for await (const _ of port.streamPrompt(params)) {
        // consume
      }
    })();

    await new Promise((r) => setTimeout(r, 5));
    await expect(async () => {
      for await (const _ of port.streamPrompt(params)) {
        // should not start
      }
    }).rejects.toThrow(/already in progress/i);

    releasePrompt();
    await first;
  });

  it("stays busy after the consumer abandons the stream until the prompt settles", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const update = {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk" as const,
        content: { type: "text", text: "partial" },
      },
    };
    (inner.prompt as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      setTimeout(() => {
        (inner as unknown as EventEmitter).emit("sessionUpdate", update);
      }, 0);
      await gate;
      return { stopReason: "end_turn" };
    });

    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];

    // Consumer takes one envelope and walks away; the underlying prompt is still in flight.
    for await (const _envelope of port.streamPrompt(params)) {
      break;
    }

    const second = (async () => {
      for await (const _envelope of port.streamPrompt(params)) {
        // no-op
      }
    })();
    await expect(second).rejects.toThrow(ERROR_MESSAGE.STREAM_PROMPT_IN_PROGRESS);
    expect(inner.prompt).toHaveBeenCalledTimes(1);

    release();
    await new Promise((r) => setTimeout(r, 5));

    // Once the prompt has settled the port is usable again.
    for await (const _envelope of port.streamPrompt(params)) {
      // drain
    }
    expect(inner.prompt).toHaveBeenCalledTimes(2);
  });

  it("detaches its session listener once the prompt settles", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    (inner.prompt as ReturnType<typeof vi.fn>).mockResolvedValue({ stopReason: "end_turn" });

    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    for await (const _envelope of port.streamPrompt(params)) {
      // drain
    }

    expect(inner.listenerCount("sessionUpdate")).toBe(1);
  });

  it("frees the stream lock on disconnect even if the prompt never settles", async () => {
    const inner = createMockPort();
    const port = new StreamAgentPort(inner);
    const update = {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk" as const,
        content: { type: "text", text: "partial" },
      },
    };
    (inner.prompt as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      setTimeout(() => {
        (inner as unknown as EventEmitter).emit("sessionUpdate", update);
      }, 0);
      // Never settles: an agent that hangs without closing its pipe.
      return new Promise(() => {});
    });

    const params = { sessionId: "s1", prompt: [] } as Parameters<IAgentPort["prompt"]>[0];
    for await (const _envelope of port.streamPrompt(params)) {
      break;
    }

    await port.disconnect();
    (inner.prompt as ReturnType<typeof vi.fn>).mockResolvedValue({ stopReason: "end_turn" });

    // A reset port must be usable again rather than permanently busy.
    for await (const _envelope of port.streamPrompt(params)) {
      // drain
    }
    expect(inner.prompt).toHaveBeenCalledTimes(2);
  });
});
