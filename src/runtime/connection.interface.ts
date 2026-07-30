import type { Stream } from "@agentclientprotocol/sdk";
import type { CONNECTION_EVENT } from "../domain/connection.events";
import type { ConnectionStatus } from "../domain/connection.status";

/**
 * Abstraction for a duplex stream to an ACP agent. No harness or provider logic.
 */
export interface IConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStream(): Stream | undefined;
  readonly connectionStatus: ConnectionStatus;
  on(event: typeof CONNECTION_EVENT.STATE, handler: (status: ConnectionStatus) => void): this;
  on(event: typeof CONNECTION_EVENT.ERROR, handler: (error: Error) => void): this;
  on(
    event: typeof CONNECTION_EVENT.EXIT,
    handler: (info: { code: number | null; signal: string | null }) => void
  ): this;
}
