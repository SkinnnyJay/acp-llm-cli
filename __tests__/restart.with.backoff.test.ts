import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import type { IAgentPort } from "../src/runtime/agent.port";
import { restartWithBackoff } from "../src/runtime/restart.with.backoff";

function createMockPort(options: { hasRestart?: boolean } = {}): IAgentPort {
  const emitter = new EventEmitter();
  const port = {
    get connectionStatus() {
      return CONNECTION_STATUS.DISCONNECTED;
    },
    capabilities: {},
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue({ protocolVersion: "1" }),
    newSession: vi.fn().mockResolvedValue({ sessionId: "s1" }),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    authenticate: vi.fn().mockResolvedValue({}),
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    addListener: emitter.addListener.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
    listeners: emitter.listeners.bind(emitter),
    listenerCount: emitter.listenerCount.bind(emitter),
    eventNames: emitter.eventNames.bind(emitter),
    once: emitter.once.bind(emitter),
  } as unknown as IAgentPort;

  if (options.hasRestart) {
    (port as IAgentPort & { restart: () => Promise<void> }).restart = vi
      .fn()
      .mockResolvedValue(undefined);
  }

  return port;
}

describe("restartWithBackoff", () => {
  it("calls port.restart() when the port has a restart method", async () => {
    const port = createMockPort({ hasRestart: true });
    await restartWithBackoff(port, { maxRetries: 1, backoffBaseMs: 0, backoffCapMs: 0 });
    expect((port as IAgentPort & { restart: () => Promise<void> }).restart).toHaveBeenCalledOnce();
    expect(port.disconnect).not.toHaveBeenCalled();
    expect(port.connect).not.toHaveBeenCalled();
  });

  it("falls back to disconnect + connect + initialize when no restart method", async () => {
    const port = createMockPort({ hasRestart: false });
    const calls: string[] = [];
    (port.disconnect as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push("disconnect");
    });
    (port.connect as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push("connect");
    });
    (port.initialize as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push("initialize");
    });

    await restartWithBackoff(port, { maxRetries: 1, backoffBaseMs: 0, backoffCapMs: 0 });

    expect(calls).toEqual(["disconnect", "connect", "initialize"]);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const port = createMockPort({ hasRestart: true });
    const restart = port as IAgentPort & { restart: () => Promise<void> };
    (restart.restart as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce(undefined);

    await expect(
      restartWithBackoff(port, { maxRetries: 2, backoffBaseMs: 0, backoffCapMs: 0 })
    ).resolves.toBeUndefined();

    expect(restart.restart as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("throws after all retries are exhausted", async () => {
    const port = createMockPort({ hasRestart: true });
    const restart = port as IAgentPort & { restart: () => Promise<void> };
    (restart.restart as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("permanent failure"));

    await expect(
      restartWithBackoff(port, { maxRetries: 2, backoffBaseMs: 0, backoffCapMs: 0 })
    ).rejects.toThrow("permanent failure");

    expect(restart.restart as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("succeeds on first attempt without retrying", async () => {
    const port = createMockPort({ hasRestart: true });
    await restartWithBackoff(port, { maxRetries: 3, backoffBaseMs: 0, backoffCapMs: 0 });
    expect(
      (port as IAgentPort & { restart: () => Promise<void> }).restart as ReturnType<typeof vi.fn>
    ).toHaveBeenCalledTimes(1);
  });

  it("uses default options when none are provided", async () => {
    const port = createMockPort({ hasRestart: true });
    await expect(restartWithBackoff(port)).resolves.toBeUndefined();
  });
});

describe("restartWithBackoff actually waits between attempts", () => {
  it("applies the capped exponential delay for real (regression: unawaited onRetry gave zero backoff)", async () => {
    vi.useFakeTimers();
    try {
      const port = createMockPort({ hasRestart: true });
      const restart = port as IAgentPort & { restart: () => Promise<void> };
      (restart.restart as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("t1"))
        .mockRejectedValueOnce(new Error("t2"))
        .mockResolvedValueOnce(undefined);

      const p = restartWithBackoff(port, { maxRetries: 3, backoffBaseMs: 100, backoffCapMs: 5000 });
      // Attempt 1 fails synchronously in microtasks; delay = min(100 * 2^1, 5000) = 200ms.
      await vi.advanceTimersByTimeAsync(0);
      expect(restart.restart as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(199);
      expect(restart.restart as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(restart.restart as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
      // Attempt 2 fails; delay = min(100 * 2^2, 5000) = 400ms.
      await vi.advanceTimersByTimeAsync(400);
      expect(restart.restart as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(3);
      await expect(p).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
