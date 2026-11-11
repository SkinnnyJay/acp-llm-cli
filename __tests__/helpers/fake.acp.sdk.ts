import type { Mock } from "vitest";
import { vi } from "vitest";

type Handler = (context: { params: unknown }) => unknown;

/**
 * Stand-in for the SDK's `client()` app. Records the handlers ACPClient registers and the
 * requests it sends, so tests can drive inbound calls and assert outbound ones without a
 * real JSON-RPC peer.
 */
export interface FakeAcpSdk {
  /** Passed to vi.mock as the replacement for the SDK's `client` export. */
  client: Mock<() => FakeClientApp>;
  /** Outbound agent requests: (method, params). Resolves from `responses`. */
  request: Mock<(method: string, params: unknown) => Promise<unknown>>;
  /** Response per method name. Tests set these in beforeEach. */
  responses: Map<string, unknown>;
  /** Number of times app.connect(stream) ran, i.e. reader loops started. */
  connect: Mock<(stream: unknown) => unknown>;
  /** close() of the most recent connection handle. */
  close: Mock<() => void>;
  /** Invoke a registered inbound request handler as the agent would. */
  callRequest(method: string, params: unknown): Promise<unknown>;
  /** Invoke a registered inbound notification handler as the agent would. */
  callNotification(method: string, params: unknown): Promise<void>;
  reset(): void;
}

interface FakeClientApp {
  onRequest(method: string, handler: Handler): FakeClientApp;
  onNotification(method: string, handler: Handler): FakeClientApp;
  connect(stream: unknown): unknown;
}

export function createFakeAcpSdk(): FakeAcpSdk {
  const requestHandlers = new Map<string, Handler>();
  const notificationHandlers = new Map<string, Handler>();
  const responses = new Map<string, unknown>();
  const request = vi.fn(async (method: string, _params: unknown) => responses.get(method));
  const close = vi.fn();
  const connect = vi.fn((_stream: unknown) => ({
    agent: { request },
    signal: new AbortController().signal,
    closed: new Promise<void>(() => undefined),
    close,
  }));
  const app: FakeClientApp = {
    onRequest(method, handler) {
      requestHandlers.set(method, handler);
      return app;
    },
    onNotification(method, handler) {
      notificationHandlers.set(method, handler);
      return app;
    },
    connect,
  };
  const require = (map: Map<string, Handler>, method: string): Handler => {
    const handler = map.get(method);
    if (!handler) throw new Error(`no handler registered for ${method}`);
    return handler;
  };
  return {
    client: vi.fn(() => app),
    request,
    responses,
    connect,
    close,
    async callRequest(method, params) {
      return require(requestHandlers, method)({ params });
    },
    async callNotification(method, params) {
      await require(notificationHandlers, method)({ params });
    },
    reset() {
      request.mockClear();
      connect.mockClear();
      close.mockClear();
      responses.clear();
    },
  };
}
