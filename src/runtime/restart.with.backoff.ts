import { delay } from "@simpill/async.utils";
import { LIMIT } from "../domain/limits";
import { TIMEOUT } from "../domain/timeouts";
import type { IAgentPort } from "./agent.port";

export interface RestartWithBackoffOptions {
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /**
   * "full" (default): AWS full jitter — sleep = random() * min(cap, base * 2^attempt).
   * Decorrelates simultaneous restarts so a fleet of harnesses does not
   * hammer a recovering agent in lockstep.
   * "none": deterministic capped exponential.
   */
  jitter?: "full" | "none";
  /** Injectable RNG for deterministic tests. */
  random?: () => number;
}

/**
 * Restart the port (disconnect, connect, initialize) with capped exponential
 * backoff and full jitter between failed attempts.
 *
 * The delays are awaited inline. The frozen version delegated the sleep to
 * @simpill/async.utils retry's onRetry callback — but retry invokes onRetry
 * WITHOUT awaiting it (fire-and-forget, its own delayMs defaulted to 0), so
 * every retry fired immediately and "exponential backoff" never delayed a
 * single restart.
 *
 * Uses port.restart() when available; otherwise disconnect + connect + initialize.
 */
export async function restartWithBackoff(
  port: IAgentPort,
  options: RestartWithBackoffOptions = {}
): Promise<void> {
  const {
    maxRetries = LIMIT.MAX_RETRIES,
    backoffBaseMs = TIMEOUT.BACKOFF_BASE_MS,
    backoffCapMs = TIMEOUT.BACKOFF_CAP_MS,
    jitter = "full",
    random = Math.random,
  } = options;

  const doRestart = async (): Promise<void> => {
    if (port.restart) {
      await port.restart();
      return;
    }
    await port.disconnect();
    await port.connect();
    await port.initialize();
  };

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await doRestart();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const cappedMs = Math.min(
          backoffBaseMs * LIMIT.RETRY_EXPONENTIAL_BASE ** attempt,
          backoffCapMs
        );
        const waitMs = jitter === "full" ? random() * cappedMs : cappedMs;
        if (waitMs > 0) await delay(waitMs);
      }
    }
  }
  throw lastError ?? new Error("restartWithBackoff: all attempts failed");
}
