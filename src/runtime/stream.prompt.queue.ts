import type { SessionNotification } from "@agentclientprotocol/sdk";

/** Async queue for streamPrompt. Read-index dequeue avoids O(n) Array.shift(). */
export function createStreamPromptQueue(): {
  push(update: SessionNotification): void;
  pushError(err: Error): void;
  close(): void;
  consume(): AsyncIterable<SessionNotification>;
} {
  const REASON = { END: "end", ERROR: "error" } as const;
  type Done = { reason: typeof REASON.END } | { reason: typeof REASON.ERROR; error: Error };
  const queue: SessionNotification[] = [];
  let readIndex = 0;
  let wake: (() => void) | null = null;
  let closed = false;
  let done: Done | null = null;

  const dequeue = (): SessionNotification | undefined => {
    if (readIndex >= queue.length) return undefined;
    const value = queue[readIndex];
    readIndex += 1;
    if (readIndex > 64 && readIndex * 2 > queue.length) {
      queue.splice(0, readIndex);
      readIndex = 0;
    }
    return value;
  };

  const nextPromise = (): Promise<IteratorResult<SessionNotification>> => {
    if (done) {
      if (done.reason === REASON.ERROR) return Promise.reject(done.error);
      return Promise.resolve({ done: true, value: undefined });
    }
    const queued = dequeue();
    if (queued !== undefined) return Promise.resolve({ done: false, value: queued });
    return new Promise((resolve, reject) => {
      wake = () => {
        wake = null;
        if (done) {
          if (done.reason === REASON.ERROR) reject(done.error);
          else resolve({ done: true, value: undefined });
          return;
        }
        const value = dequeue();
        resolve(value !== undefined ? { done: false, value } : { done: true, value: undefined });
      };
    });
  };

  return {
    push(update) {
      if (closed) return;
      queue.push(update);
      if (wake) wake();
    },
    pushError(err) {
      if (done) return;
      done = { reason: REASON.ERROR, error: err };
      if (wake) wake();
    },
    close() {
      if (closed) return;
      closed = true;
      if (!done) done = { reason: REASON.END };
      if (wake) wake();
    },
    consume() {
      return { [Symbol.asyncIterator]() { return { next: () => nextPromise() }; } };
    },
  };
}
