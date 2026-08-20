import { delay } from "@simpill/async.utils";
import { LIMIT } from "../domain/limits";
import { TIMEOUT } from "../domain/timeouts";
import type { IAgentPort } from "./agent.port";

export interface RestartWithBackoffOptions {
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
}

/**
 * Restart the port (disconnect, connect, initialize) with exponential backoff on failure.
 * Uses port.restart() when available; otherwise disconnect + connect + initialize.
 *
 * The backoff loop is inline rather than @simpill/async.utils retry: retry@1.0.0
 * fires onRetry without awaiting it, so an async onRetry that sleeps (the previous
 * implementation here) floats and every attempt actually ran back-to-back with
 * zero delay. The inline loop awaits the capped exponential delay for real.
 */
export async function restartWithBackoff(
  port: IAgentPort,
  options: RestartWithBackoffOptions = {}
): Promise<void> {
  const {
    maxRetries = LIMIT.MAX_RETRIES,
    backoffBaseMs = TIMEOUT.BACKOFF_BASE_MS,
    backoffCapMs = TIMEOUT.BACKOFF_CAP_MS,
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
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await doRestart();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const cappedMs = Math.min(
          backoffBaseMs * LIMIT.RETRY_EXPONENTIAL_BASE ** attempt,
          backoffCapMs
        );
        await delay(cappedMs);
      }
    }
  }
  throw lastError ?? new Error("restartWithBackoff: no attempts were made");
}
