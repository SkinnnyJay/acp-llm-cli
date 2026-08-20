import type { Stream } from "@agentclientprotocol/sdk";
import type { CONNECTION_EVENT } from "../domain/connection.events";
import type { ConnectionStatus } from "../domain/connection.status";

/**
 * Payload types for the connection protocol, declared once. CONNECTION_EVENT holds the names;
 * this holds what each one carries. Previously the same three signatures were written out by
 * hand in IConnection, again in IACPConnectionLike, and a third time as an inline emitter shape
 * on StdioConnection keyed by raw string literals - four declarations that merely happened to
 * agree, with nothing forcing them to.
 */
export interface ConnectionEvents {
  state: (status: ConnectionStatus) => void;
  error: (error: Error) => void;
  /**
   * The agent process exited. Distinguishes "died on its own" from "we asked it to stop", which
   * `state` alone cannot.
   *
   * Implementations MUST clear the stream returned by `getStream()` before emitting this for the
   * process that stream belonged to. Consumers use that to tell whether an exit refers to the
   * process backing their current stream or to one already replaced.
   */
  exit: (info: { code: number | null; signal: string | null }) => void;
}

/**
 * Abstraction for a duplex stream to an ACP agent. No harness or provider logic.
 */
export interface IConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStream(): Stream | undefined;
  readonly connectionStatus: ConnectionStatus;
  // Overloads rather than one generic signature: eventemitter3's own generic `on` does not
  // relate to a generic requirement. The payload types still come from ConnectionEvents, so
  // there is one source of truth either way.
  on(event: typeof CONNECTION_EVENT.STATE, handler: ConnectionEvents["state"]): this;
  on(event: typeof CONNECTION_EVENT.ERROR, handler: ConnectionEvents["error"]): this;
  on(event: typeof CONNECTION_EVENT.EXIT, handler: ConnectionEvents["exit"]): this;
}
