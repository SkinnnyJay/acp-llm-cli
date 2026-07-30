import type { SessionNotification } from "@agentclientprotocol/sdk";

/**
 * Minimal async queue: one producer (sessionUpdate handler), one consumer (async iterator).
 * Used to bridge event-based session updates into an async iterable for streamPrompt.
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

  const queue: SessionNotification[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  let done: StreamPromptQueueDone | null = null;

  const nextPromise = (): Promise<IteratorResult<SessionNotification>> => {
    if (done) {
      if (done.reason === STREAM_PROMPT_QUEUE_REASON.ERROR) {
        return Promise.reject(done.error);
      }
      return Promise.resolve({ done: true, value: undefined });
    }
    const queued = queue.shift();
    if (queued !== undefined) {
      return Promise.resolve({ done: false, value: queued });
    }
    return new Promise((resolve, reject) => {
      wake = () => {
        wake = null;
        if (done) {
          if (done.reason === STREAM_PROMPT_QUEUE_REASON.ERROR) {
            reject(done.error);
          } else resolve({ done: true, value: undefined });
          return;
        }
        const value = queue.shift();
        if (value !== undefined) {
          resolve({ done: false, value });
        }
      };
    });
  };

  return {
    push(update: SessionNotification) {
      if (closed) return;
      queue.push(update);
      if (wake) wake();
    },
    pushError(err: Error) {
      if (done) return;
      done = { reason: STREAM_PROMPT_QUEUE_REASON.ERROR, error: err };
      if (wake) wake();
    },
    close() {
      if (closed) return;
      closed = true;
      if (!done) done = { reason: STREAM_PROMPT_QUEUE_REASON.END };
      if (wake) wake();
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
