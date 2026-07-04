import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import { restartWithBackoff } from "../src/runtime/restart.with.backoff";
import type { IAgentPort } from "../src/runtime/agent.port";

const createFailingPort = (failures: number) => {
  let calls = 0;
  const port = new EventEmitter() as unknown as IAgentPort & { restartCalls: () => number };
  Object.assign(port, {
    connectionStatus: "disconnected",
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue({}),
    newSession: vi.fn(),
    prompt: vi.fn(),
    authenticate: vi.fn(),
    sessionUpdate: vi.fn(),
    restart: vi.fn().mockImplementation(async () => {
      calls++;
      if (calls <= failures) throw new Error(`restart failure ${calls}`);
    }),
    restartCalls: () => calls,
  });
  return port;
};

describe("restartWithBackoff", () => {
  it("actually waits between failed attempts (frozen version never delayed)", async () => {
    // The frozen implementation passed an async onRetry to
    // @simpill/async.utils retry, which invokes onRetry WITHOUT awaiting it
    // and whose own delayMs defaults to 0 — so all retries fired back to
    // back with zero backoff.
    const port = createFailingPort(2);
    const start = Date.now();
    await restartWithBackoff(port, {
      maxRetries: 3,
      backoffBaseMs: 30,
      backoffCapMs: 1000,
      jitter: "none",
    });
    const elapsed = Date.now() - start;
    // Expected schedule: fail -> 30ms -> fail -> 60ms -> success = 90ms.
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(port.restartCalls()).toBe(3);
  });

  it("caps the exponential delay at backoffCapMs", async () => {
    const port = createFailingPort(2);
    const start = Date.now();
    await restartWithBackoff(port, {
      maxRetries: 3,
      backoffBaseMs: 40,
      backoffCapMs: 45,
      jitter: "none",
    });
    const elapsed = Date.now() - start;
    // 40ms + min(80, 45)=45ms = 85ms, well under the uncapped 120ms.
    expect(elapsed).toBeGreaterThanOrEqual(75);
    expect(elapsed).toBeLessThan(200);
  });

  it("full jitter draws the delay from [0, capped] via the injected rng", async () => {
    const port = createFailingPort(1);
    const random = vi.fn().mockReturnValue(0);
    const start = Date.now();
    await restartWithBackoff(port, {
      maxRetries: 2,
      backoffBaseMs: 500,
      backoffCapMs: 5000,
      jitter: "full",
      random,
    });
    const elapsed = Date.now() - start;
    expect(random).toHaveBeenCalledTimes(1);
    // rng=0 -> zero sleep even with a 500ms base.
    expect(elapsed).toBeLessThan(100);
  });

  it("throws the last error after exhausting retries", async () => {
    const port = createFailingPort(99);
    await expect(
      restartWithBackoff(port, { maxRetries: 2, backoffBaseMs: 1, jitter: "none" })
    ).rejects.toThrow("restart failure 2");
    expect(port.restartCalls()).toBe(2);
  });

  it("falls back to disconnect+connect+initialize when restart is absent", async () => {
    const port = new EventEmitter() as unknown as IAgentPort;
    const connect = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue({});
    Object.assign(port, {
      connectionStatus: "disconnected",
      connect,
      disconnect,
      initialize,
      newSession: vi.fn(),
      prompt: vi.fn(),
      authenticate: vi.fn(),
      sessionUpdate: vi.fn(),
    });
    await restartWithBackoff(port, { maxRetries: 1 });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
