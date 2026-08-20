import { EventEmitter } from "eventemitter3";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { CONNECTION_EVENT } from "../../src/domain/connection.events";
import type { ConnectionStatus } from "../../src/domain/connection.status";
import { CONNECTION_STATUS } from "../../src/domain/connection.status";
import type { IACPConnectionLike } from "../../src/runtime/acp.client";

type ExitInfo = { code: number | null; signal: string | null };

/**
 * Shared fake transport for ACPClient tests, backed by a real emitter so handlers registered in
 * the client's constructor actually run. The previous per-file fakes used `on: vi.fn()`, which
 * discarded every handler - the whole connection-to-port event forwarding surface was therefore
 * unexercised, and deleting it left the suite green.
 *
 * Typed as IACPConnectionLike by annotation, not by cast: if this stops satisfying the interface,
 * that is a real signal rather than something to paper over.
 */
export interface FakeAcpConnection extends IACPConnectionLike {
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
  getStream: Mock<() => ReturnType<IACPConnectionLike["getStream"]>>;
  /** Drives a status change the way a real transport would: mutate, then announce. */
  setStatus(status: ConnectionStatus): void;
  emitError(error: Error): void;
  emitExit(info: ExitInfo): void;
  listenerCountFor(event: string): number;
}

export function createFakeAcpConnection(
  stream: unknown = { readable: true, writable: true }
): FakeAcpConnection {
  const emitter = new EventEmitter();
  let status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;

  const fake: FakeAcpConnection = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getStream: vi.fn().mockReturnValue(stream),
    get connectionStatus(): ConnectionStatus {
      return status;
    },
    on(event: string, handler: (payload: never) => void): void {
      emitter.on(event, handler as (...args: unknown[]) => void);
    },
    setStatus(next: ConnectionStatus): void {
      status = next;
      emitter.emit(CONNECTION_EVENT.STATE, next);
    },
    emitError(error: Error): void {
      emitter.emit(CONNECTION_EVENT.ERROR, error);
    },
    emitExit(info: ExitInfo): void {
      emitter.emit(CONNECTION_EVENT.EXIT, info);
    },
    listenerCountFor(event: string): number {
      return emitter.listenerCount(event);
    },
  };

  return fake;
}
