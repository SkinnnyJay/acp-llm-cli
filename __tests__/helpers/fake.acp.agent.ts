import { ndJsonStream, type Stream } from "@agentclientprotocol/sdk";

export type WriteMode = "one-chunk" | "separate-writes";
export type JsonMessage = Record<string, unknown>;

/**
 * A scripted ACP agent on the far end of in-memory pipes, for tests that run the real SDK over
 * `ndJsonStream`. It answers `initialize`; for the n-th `session/prompt` (0-based) it sends what
 * `onPrompt` returns, either as one chunk or one write per message.
 */
export interface FakeAcpAgent {
  /** The client side of the pipes, to hand to the transport under test. */
  stream: Stream;
  /** Ends the agent's output (EOF on the client's readable) without touching the transport. */
  endOutput(): Promise<void>;
  /** Releases both pipes and waits for the agent loop to finish. */
  close(): Promise<void>;
}

export function createFakeAcpAgent(
  mode: WriteMode = "separate-writes",
  onPrompt: (n: number, id: unknown) => JsonMessage[] = (_n, id) => [
    { jsonrpc: "2.0", id, result: { stopReason: "end_turn" } },
  ]
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
        if (message.method === "initialize") {
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
    endOutput,
    async close() {
      await endOutput();
      await reader.cancel().catch(() => undefined);
      await loop;
    },
  };
}
