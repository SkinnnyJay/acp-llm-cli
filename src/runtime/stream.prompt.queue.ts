import type { SessionNotification } from "@agentclientprotocol/sdk";

/**
 * Minimal async queue: one producer (sessionUpdate handler), one or more consumers
 * (async iterator). Used to bridge event-based session updates into an async
 * iterable for streamPrompt.
 *
 * Delivery contract:
 * - Updates pushed before close()/pushError() are ALWAYS delivered, in order,
 *   before the stream ends or the error is thrown (drain-before-done). ACP
 *   requires clients to keep accepting session updates until the turn's final
 *   stop reason, so tail updates must never be dropped by a slow consumer.
 * - close() ends the stream after the queue drains.
 * - pushError() rejects the consumer after the queue drains.
 * - push()/pushError() after close are no-ops.
 */
export function createStreamPromptQueue(): {
  push(update: SessionNotification): void;
  pushError(err: Error): void;
  close(): void;
  consume(): AsyncIterable<SessionNotification>;
} {
  const STREAM_PROMPT_QUEUE_REASON = {
    END: "end",
    ERROR: "error",
  } as const;

  type StreamPromptQueueDone =
    | { reason: typeof STREAM_PROMPT_QUEUE_REASON.END }
    | { reason: typeof STREAM_PROMPT_QUEUE_REASON.ERROR; error: Error };

  type Waiter = {
    resolve: (result: IteratorResult<SessionNotification>) => void;
    reject: (error: Error) => void;
  };

  // Head-index FIFOs: avoid O(n) Array#shift on long streams.
  const queue: SessionNotification[] = [];
  let queueHead = 0;
  const waiters: Waiter[] = [];
  let waitersHead = 0;
  let closed = false;
  let done: StreamPromptQueueDone | null = null;

  const takeQueued = (): SessionNotification => {
    const value = queue[queueHead] as SessionNotification;
    queue[queueHead] = undefined as unknown as SessionNotification;
    queueHead++;
    if (queueHead === queue.length) {
      queue.length = 0;
      queueHead = 0;
    }
    return value;
  };

  const takeWaiter = (): Waiter => {
    const waiter = waiters[waitersHead] as Waiter;
    waiters[waitersHead] = undefined as unknown as Waiter;
    waitersHead++;
    if (waitersHead === waiters.length) {
      waiters.length = 0;
      waitersHead = 0;
    }
    return waiter;
  };

  const queuedCount = (): number => queue.length - queueHead;
  const waiterCount = (): number => waiters.length - waitersHead;

  const settleWaiters = (): void => {
    while (waiterCount() > 0 && queuedCount() > 0) {
      takeWaiter().resolve({ done: false, value: takeQueued() });
    }
    if (done && queuedCount() === 0) {
      while (waiterCount() > 0) {
        const waiter = takeWaiter();
        if (done.reason === STREAM_PROMPT_QUEUE_REASON.ERROR) {
          waiter.reject(done.error);
        } else {
          waiter.resolve({ done: true, value: undefined });
        }
      }
    }
  };

  const nextPromise = (): Promise<IteratorResult<SessionNotification>> => {
    // Drain queued updates BEFORE honoring done: items pushed before
    // close()/pushError() must reach the consumer even if it is slow.
    if (queuedCount() > 0) {
      return Promise.resolve({ done: false, value: takeQueued() });
    }
    if (done) {
      if (done.reason === STREAM_PROMPT_QUEUE_REASON.ERROR) {
        return Promise.reject(done.error);
      }
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  };

  return {
    push(update: SessionNotification) {
      if (closed) return;
      queue.push(update);
      settleWaiters();
    },
    pushError(err: Error) {
      if (done) return;
      closed = true;
      done = { reason: STREAM_PROMPT_QUEUE_REASON.ERROR, error: err };
      settleWaiters();
    },
    close() {
      if (closed && done) return;
      closed = true;
      if (!done) done = { reason: STREAM_PROMPT_QUEUE_REASON.END };
      settleWaiters();
    },
    consume(): AsyncIterable<SessionNotification> {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => nextPromise() };
        },
      };
    },
  };
}
