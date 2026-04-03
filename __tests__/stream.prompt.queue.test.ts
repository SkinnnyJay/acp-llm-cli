import { describe, expect, it } from "vitest";
import { createStreamPromptQueue } from "../src/runtime/stream.prompt.queue";

describe("createStreamPromptQueue", () => {
  it("delivers updates in order when producer pushes then closes after consumer started", async () => {
    const q = createStreamPromptQueue();
    const a = { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk" as const } };
    const b = { sessionId: "s1", update: { sessionUpdate: "tool_call" as const } };
    const c = { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk" as const } };

    const out: unknown[] = [];
    q.push(a);
    q.push(b);
    q.push(c);

    const consumed = await Promise.all([
      (async () => {
        const arr: unknown[] = [];
        for await (const u of q.consume()) {
          arr.push(u);
        }
        return arr;
      })(),
      (async () => {
        await new Promise((r) => setImmediate(r));
        q.close();
      })(),
    ]);
    const result = consumed[0];
    if (!result || !Array.isArray(result)) throw new Error("expected array");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(a);
    expect(result[1]).toEqual(b);
    expect(result[2]).toEqual(c);
  });

  it("close() ends consume after draining queued updates", async () => {
    const q = createStreamPromptQueue();
    const one = { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk" as const } };
    const out: unknown[] = [];
    const consumePromise = (async () => {
      for await (const u of q.consume()) {
        out.push(u);
      }
    })();

    q.push(one);
    q.close();
    await consumePromise;

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(one);
  });

  it("push after close is no-op", async () => {
    const q = createStreamPromptQueue();
    const out: unknown[] = [];
    const consumePromise = (async () => {
      for await (const u of q.consume()) {
        out.push(u);
      }
    })();

    q.close();
    q.push({ sessionId: "s1", update: { sessionUpdate: "agent_message_chunk" as const } });
    await consumePromise;

    expect(out).toHaveLength(0);
  });

  it("pushError causes consume to reject after draining prior updates", async () => {
    const q = createStreamPromptQueue();
    const one = { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk" as const } };
    const out: unknown[] = [];
    const consumePromise = (async () => {
      for await (const u of q.consume()) {
        out.push(u);
      }
    })();

    q.push(one);
    q.pushError(new Error("stream error"));

    await expect(consumePromise).rejects.toThrow("stream error");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(one);
  });
});
