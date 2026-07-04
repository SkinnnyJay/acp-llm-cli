import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { ENVELOPE_KIND } from "../src/domain/envelope.kind";
import { ENVELOPE_MODE } from "../src/domain/envelope.mode";
import { wrapAgentPortWithStream } from "../src/runtime/acp.agent.port.stream";
import type { IAgentPort } from "../src/runtime/agent.port";

const chunk = (text: string) =>
  ({
    sessionId: "s1",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  }) as never;

interface FakePortControls {
  port: IAgentPort;
  emitUpdate: (u: unknown) => void;
  resolvePrompt: () => void;
  rejectPrompt: (e: Error) => void;
  cancelCalls: () => unknown[];
  listenerCount: () => number;
}

const createFakePort = (): FakePortControls => {
  const emitter = new EventEmitter();
  let resolvePrompt: (() => void) | undefined;
  let rejectPrompt: ((e: Error) => void) | undefined;
  const cancelCalls: unknown[] = [];
  const port = emitter as unknown as IAgentPort;
  Object.assign(port, {
    connectionStatus: "connected",
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue({}),
    newSession: vi.fn(),
    authenticate: vi.fn(),
    sessionUpdate: vi.fn(),
    prompt: vi.fn().mockImplementation(
      () =>
        new Promise<unknown>((resolve, reject) => {
          resolvePrompt = () => resolve({ stopReason: "end_turn" });
          rejectPrompt = reject;
        })
    ),
    cancel: vi.fn().mockImplementation(async (params: unknown) => {
      cancelCalls.push(params);
    }),
  });
  return {
    port,
    emitUpdate: (u) => emitter.emit("sessionUpdate", u),
    resolvePrompt: () => resolvePrompt?.(),
    rejectPrompt: (e) => rejectPrompt?.(e),
    cancelCalls: () => cancelCalls,
    listenerCount: () => emitter.listenerCount("sessionUpdate"),
  };
};

const tick = () => new Promise((r) => setImmediate(r));

describe("wrapAgentPortWithStream streamPrompt", () => {
  it("delivers ALL updates emitted before the prompt settles, even to a slow consumer", async () => {
    const fake = createFakePort();
    const wrapped = wrapAgentPortWithStream(fake.port);

    const out: string[] = [];
    const consumer = (async () => {
      for await (const env of wrapped.streamPrompt!(
        { sessionId: "s1", prompt: [] } as never,
        { envelopeMode: ENVELOPE_MODE.NATIVE }
      )) {
        if (env.kind === ENVELOPE_KIND.NATIVE) {
          const u = env.update as { update: { content?: { text?: string } } };
          out.push(u.update.content?.text ?? "");
        }
        await new Promise((r) => setTimeout(r, 2)); // slow consumer
      }
    })();

    await tick();
    fake.emitUpdate(chunk("a"));
    fake.emitUpdate(chunk("b"));
    fake.emitUpdate(chunk("c"));
    fake.resolvePrompt(); // turn ends while consumer is mid-"a"
    await consumer;

    // Frozen version dropped the tail: queue.close() beat the consumer and
    // nextPromise honored done before draining.
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("prompt rejection is delivered in order AFTER queued updates and does not raise unhandledRejection", async () => {
    const fake = createFakePort();
    const wrapped = wrapAgentPortWithStream(fake.port);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const out: string[] = [];
      const consumer = (async () => {
        for await (const env of wrapped.streamPrompt!(
          { sessionId: "s1", prompt: [] } as never,
          { envelopeMode: ENVELOPE_MODE.NATIVE }
        )) {
          if (env.kind === ENVELOPE_KIND.NATIVE) {
            const u = env.update as { update: { content?: { text?: string } } };
            out.push(u.update.content?.text ?? "");
          }
          await new Promise((r) => setTimeout(r, 2));
        }
      })();

      await tick();
      fake.emitUpdate(chunk("partial"));
      fake.rejectPrompt(new Error("agent exploded"));
      await expect(consumer).rejects.toThrow("agent exploded");
      expect(out).toEqual(["partial"]);

      // Give any stray rejection chains time to surface. The frozen
      // promptPromise.finally() chain re-raised the rejection with no
      // handler attached — an unhandledRejection (fatal under Node
      // defaults) on EVERY failed streamed prompt.
      await tick();
      await tick();
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("consumer break detaches the listener immediately and cancels the in-flight turn", async () => {
    const fake = createFakePort();
    const wrapped = wrapAgentPortWithStream(fake.port);

    const iterator = wrapped
      .streamPrompt!({ sessionId: "s1", prompt: [] } as never, {
        envelopeMode: ENVELOPE_MODE.NATIVE,
      })
      [Symbol.asyncIterator]();

    const first = iterator.next();
    await tick();
    fake.emitUpdate(chunk("a"));
    await first;

    // 1 permanent event-forwarding listener + 1 streamPrompt handler.
    expect(fake.listenerCount()).toBe(2);
    await iterator.return?.(undefined as never); // consumer walks away
    // Frozen version left the streamPrompt handler attached until the prompt
    // settled and never told the agent to stop: the turn kept burning tokens
    // for nobody. Only the permanent forwarder remains now.
    expect(fake.listenerCount()).toBe(1);
    expect(fake.cancelCalls()).toEqual([{ sessionId: "s1" }]);
  });

  it("emits the OpenAI finish envelope only on success", async () => {
    const fake = createFakePort();
    const wrapped = wrapAgentPortWithStream(fake.port, { modelId: "m1" });

    const envelopes: unknown[] = [];
    const consumer = (async () => {
      for await (const env of wrapped.streamPrompt!(
        { sessionId: "s1", prompt: [] } as never,
        { envelopeMode: ENVELOPE_MODE.OPENAI }
      )) {
        envelopes.push(env);
      }
    })();

    await tick();
    fake.emitUpdate(chunk("hello"));
    fake.resolvePrompt();
    await consumer;

    const last = envelopes[envelopes.length - 1] as {
      choices: Array<{ finish_reason: string | null }>;
    };
    expect(last.choices[0]?.finish_reason).toBe("stop");
  });

  it("advertises the cancel capability and forwards cancel to the inner port", async () => {
    const fake = createFakePort();
    const wrapped = wrapAgentPortWithStream(fake.port);
    expect(wrapped.capabilities?.cancel).toBe(true);
    await wrapped.cancel?.({ sessionId: "s9" } as never);
    expect(fake.cancelCalls()).toEqual([{ sessionId: "s9" }]);
  });
});
