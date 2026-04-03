import { delay, retry } from "@simpill/async.utils";
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
 * Uses @simpill/async.utils retry + delay with capped backoff.
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

  await retry(doRestart, {
    maxAttempts: maxRetries,
    onRetry: async (_error: Error, attempt: number) => {
      const cappedMs = Math.min(
        backoffBaseMs * LIMIT.RETRY_EXPONENTIAL_BASE ** attempt,
        backoffCapMs
      );
      await delay(cappedMs);
    },
  });
}
