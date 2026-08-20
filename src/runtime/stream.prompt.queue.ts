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
  /** Single terminal state. "Terminal" means no more producers, not "stop reading". */
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

  // Always drain before consulting the terminal state: close() means "no more updates are
  // coming", not "discard what is already buffered". Checking `done` first dropped any update
  // pushed while the consumer was between reads.
  const settleTerminal = (
    resolve: (result: IteratorResult<SessionNotification>) => void,
    reject: (error: Error) => void
  ): void => {
    if (done?.reason === REASON.ERROR) reject(done.error);
    else resolve({ done: true, value: undefined });
  };

  const nextPromise = (): Promise<IteratorResult<SessionNotification>> => {
    const queued = dequeue();
    if (queued !== undefined) return Promise.resolve({ done: false, value: queued });
    if (done) {
      if (done.reason === REASON.ERROR) return Promise.reject(done.error);
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve, reject) => {
      wake = () => {
        wake = null;
        const value = dequeue();
        if (value !== undefined) {
          resolve({ done: false, value });
          return;
        }
        settleTerminal(resolve, reject);
      };
    });
  };

  return {
    push(update) {
      // Guarding on the terminal state (rather than a separate `closed` flag) makes
      // "terminated but still accepting pushes" unrepresentable.
      if (done) return;
      queue.push(update);
      if (wake) wake();
    },
    pushError(err) {
      if (done) return;
      done = { reason: REASON.ERROR, error: err };
      if (wake) wake();
    },
    close() {
      if (done) return;
      done = { reason: REASON.END };
      if (wake) wake();
    },
    consume() {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => nextPromise() };
        },
      };
    },
  };
}
