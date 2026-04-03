import type { IProviderMetrics } from "./interfaces/provider.types";

/**
 * Simple metrics collector for a provider: invocation count, last error, last duration.
 * Thread-safe for single-threaded Node; for concurrent use, add locking or use atomics.
 */
export class ProviderMetricsCollector implements IProviderMetrics {
  private _invocations = 0;
  private _lastError: string | undefined;
  private _lastInvocationMs: number | undefined;

  get invocations(): number {
    return this._invocations;
  }

  get lastError(): string | undefined {
    return this._lastError;
  }

  get lastInvocationMs(): number | undefined {
    return this._lastInvocationMs;
  }

  recordSuccess(durationMs: number): void {
    this._invocations += 1;
    this._lastError = undefined;
    this._lastInvocationMs = durationMs;
  }

  recordFailure(error: string): void {
    this._invocations += 1;
    this._lastError = error;
    this._lastInvocationMs = undefined;
  }

  reset(): void {
    this._invocations = 0;
    this._lastError = undefined;
    this._lastInvocationMs = undefined;
  }
}
