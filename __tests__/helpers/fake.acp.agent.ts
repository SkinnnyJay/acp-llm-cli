import { ndJsonStream, type Stream } from "@agentclientprotocol/sdk";

export type WriteMode = "one-chunk" | "separate-writes";
export type JsonMessage = Record<string, unknown>;

/**
 * A scripted ACP agent on the far end of in-memory pipes, for tests that run the real SDK over
 * `ndJsonStream`. It answers `initialize`; for the n-th `session/prompt` (0-based) it sends what
 * `onPrompt` returns, either as one chunk or one write per message. `respond`, when given, sees
 * every request from the client first; returning messages sends them instead of the default.
 */
export interface FakeAcpAgent {
  /** The client side of the pipes, to hand to the transport under test. */
  stream: Stream;
  /**
   * Sends a JSON-RPC request to the client and resolves with the client's response message
   * exactly as it came off the wire (`result` or `error`).
   */
  request(method: string, params: unknown): Promise<JsonMessage>;
  /** Methods of the requests and notifications the agent has received from the client. */
  received: string[];
  /** Ends the agent's output (EOF on the client's readable) without touching the transport. */
  endOutput(): Promise<void>;
  /** Releases both pipes and waits for the agent loop to finish. */
  close(): Promise<void>;
}

export function createFakeAcpAgent(
  mode: WriteMode = "separate-writes",
  onPrompt: (n: number, id: unknown) => JsonMessage[] = (_n, id) => [
    { jsonrpc: "2.0", id, result: { stopReason: "end_turn" } },
  ],
  respond?: (request: JsonMessage) => JsonMessage[] | undefined
): FakeAcpAgent {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  const stream = ndJsonStream(clientToAgent.writable, agentToClient.readable);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const writer = agentToClient.writable.getWriter();
  const reader = clientToAgent.readable.getReader();
  const send = (messages: JsonMessage[]) => {
    const lines = messages.map((m) => `${JSON.stringify(m)}\n`);
    if (mode === "one-chunk") {
      void writer.write(encoder.encode(lines.join(""))).catch(() => undefined);
    } else {
      for (const line of lines) void writer.write(encoder.encode(line)).catch(() => undefined);
    }
  };

  const received: string[] = [];
  const pending = new Map<number, (message: JsonMessage) => void>();
  let nextRequestId = 1000;
  const request = (method: string, params: unknown) =>
    new Promise<JsonMessage>((resolve) => {
      const id = nextRequestId++;
      pending.set(id, resolve);
      send([{ jsonrpc: "2.0", id, method, params }]);
    });

  const loop = (async () => {
    let buffer = "";
    let prompts = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const message = JSON.parse(buffer.slice(0, newline)) as JsonMessage;
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (typeof message.method === "string") received.push(message.method);
        const resolveRequest = pending.get(message.id as number);
        const scripted = message.method === undefined ? undefined : respond?.(message);
        if (message.method === undefined && resolveRequest) {
          pending.delete(message.id as number);
          resolveRequest(message);
        } else if (scripted) {
          send(scripted);
        } else if (message.method === "initialize") {
          send([
            {
              jsonrpc: "2.0",
              id: message.id,
              result: { protocolVersion: 1, agentCapabilities: {} },
            },
          ]);
        } else if (message.method === "session/prompt") {
          send(onPrompt(prompts++, message.id));
        }
      }
    }
  })().catch(() => undefined);

  const endOutput = () => writer.close().catch(() => undefined);

  return {
    stream,
    request,
    received,
    endOutput,
    async close() {
      await endOutput();
      await reader.cancel().catch(() => undefined);
      await loop;
    },
  };
}
