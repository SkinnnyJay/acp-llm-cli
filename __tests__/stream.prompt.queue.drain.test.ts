import { describe, expect, it } from "vitest";
import { createStreamPromptQueue } from "../src/runtime/stream.prompt.queue";

const update = (n: number) =>
  ({ sessionId: "s1", update: { sessionUpdate: "agent_message_chunk" as const }, n }) as never;

describe("createStreamPromptQueue drain-before-done", () => {
  it("delivers updates queued BEFORE close() even when the consumer starts late", async () => {
    // Frozen behavior: nextPromise checked `done` before the queue, so any
    // update the consumer had not yet pulled when close() fired was silently
    // dropped — in streamPrompt terms, the tail of the agent's answer.
    const q = createStreamPromptQueue();
    q.push(update(1));
    q.push(update(2));
    q.push(update(3));
    q.close();

    const out: unknown[] = [];
    for await (const u of q.consume()) out.push(u);

    expect(out).toHaveLength(3);
  });

  it("delivers updates queued BEFORE pushError(), then rejects", async () => {
    const q = createStreamPromptQueue();
    q.push(update(1));
    q.push(update(2));
    q.pushError(new Error("prompt failed"));

    const out: unknown[] = [];
    await expect(
      (async () => {
        for await (const u of q.consume()) out.push(u);
      })()
    ).rejects.toThrow("prompt failed");
    expect(out).toHaveLength(2);
  });

  it("slow consumer receives every update pushed during processing", async () => {
    const q = createStreamPromptQueue();
    const out: unknown[] = [];
    const consumer = (async () => {
      for await (const u of q.consume()) {
        out.push(u);
        // Simulate per-update work (envelope mapping / user code) that lets
        // the producer finish and close before the next pull.
        await new Promise((r) => setTimeout(r, 1));
      }
    })();

    for (let i = 0; i < 50; i++) q.push(update(i));
    q.close();
    await consumer;

    expect(out).toHaveLength(50);
  });

  it("push after pushError is ignored", async () => {
    const q = createStreamPromptQueue();
    q.push(update(1));
    q.pushError(new Error("boom"));
    q.push(update(2));

    const out: unknown[] = [];
    await expect(
      (async () => {
        for await (const u of q.consume()) out.push(u);
      })()
    ).rejects.toThrow("boom");
    expect(out).toHaveLength(1);
  });

  it("supports multiple pending waiters without hanging (FIFO)", async () => {
    const q = createStreamPromptQueue();
    const iterator = q.consume()[Symbol.asyncIterator]();
    // Frozen version held a SINGLE wake slot; a second concurrent next()
    // overwrote the first, which then hung forever.
    const first = iterator.next();
    const second = iterator.next();
    q.push(update(1));
    q.push(update(2));
    q.close();

    await expect(first).resolves.toMatchObject({ done: false });
    await expect(second).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });
});
