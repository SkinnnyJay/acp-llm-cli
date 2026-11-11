import type { SessionNotification } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENVELOPE_MODE } from "../src/domain/envelope.mode";
import {
  type StreamAgentPort,
  wrapAgentPortWithStream,
} from "../src/runtime/acp.agent.port.stream";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import type { IAgentPort } from "../src/runtime/agent.port";
import { createFakeAcpAgent, type JsonMessage, type WriteMode } from "./helpers/fake.acp.agent";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";

/**
 * The real SDK over ndJsonStream, with a scripted agent on the other end of in-memory pipes.
 *
 * SDK 2.x settles a request's promise the moment its response is read, but hands each inbound
 * notification to an async handler chain. An agent that sends its last updates and then the
 * prompt response in quick succession therefore used to resolve prompt() before those updates
 * reached the port, and streamPrompt() closed its queue on them.
 */

type Json = JsonMessage;

const WRITE_MODES: WriteMode[] = ["one-chunk", "separate-writes"];
const N = 5;
const SESSION_ID = "s1";

const chunk = (text: string): Json => ({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId: SESSION_ID,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  },
});

const texts = (prefix: string) => Array.from({ length: N }, (_, k) => `${prefix}${k}`);

const textOf = (note: SessionNotification): string | undefined => {
  const update = note.update as { content?: { type?: string; text?: string } };
  return update.content?.type === "text" ? update.content.text : undefined;
};

interface Harness {
  port: IAgentPort;
  close(): Promise<void>;
}

/**
 * `onPrompt` returns the messages the agent sends for the n-th session/prompt (0-based), ending
 * with the response to `id`.
 */
async function startHarness(
  mode: WriteMode,
  onPrompt: (n: number, id: unknown) => Json[]
): Promise<Harness> {
  const agent = createFakeAcpAgent(mode, onPrompt);
  const port = createAcpAgentPort(createFakeAcpConnection(agent.stream));
  const harness = {
    port,
    async close() {
      await port.disconnect().catch(() => undefined);
      await agent.close();
    },
  };
  try {
    await port.connect();
    await port.initialize();
  } catch (error) {
    await harness.close();
    throw error;
  }
  return harness;
}

const promptResponse = (id: unknown, stopReason = "end_turn"): Json => ({
  jsonrpc: "2.0",
  id,
  result: { stopReason },
});

const promptParams = { sessionId: SESSION_ID, prompt: [{ type: "text" as const, text: "hi" }] };

describe("ACPClient delivers session/update before the prompt that follows them resolves", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    vi.restoreAllMocks();
  });

  for (const mode of WRITE_MODES) {
    it(`raw prompt() has seen all ${N} updates, in order, when it resolves (${mode})`, async () => {
      harness = await startHarness(mode, (_n, id) => [
        ...texts("t").map(chunk),
        promptResponse(id),
      ]);
      const seen: string[] = [];
      harness.port.on("sessionUpdate", (note) => seen.push(textOf(note) ?? "?"));

      const response = await harness.port.prompt(promptParams);
      const atSettle = [...seen];

      expect(response.stopReason).toBe("end_turn");
      expect(atSettle).toEqual(texts("t"));
    });

    it(`streamPrompt() yields all ${N} text chunks, in order (${mode})`, async () => {
      harness = await startHarness(mode, (_n, id) => [
        ...texts("t").map(chunk),
        promptResponse(id),
      ]);
      const port = wrapAgentPortWithStream(harness.port) as StreamAgentPort;

      const yielded: string[] = [];
      for await (const envelope of port.streamPrompt(promptParams, {
        envelopeMode: ENVELOPE_MODE.NATIVE,
      })) {
        if ("update" in envelope) yielded.push(textOf(envelope.update) ?? "?");
      }

      expect(yielded).toEqual(texts("t"));
    });

    it(`a malformed session/update neither blocks the prompt nor drops valid ones (${mode})`, async () => {
      // The SDK logs the schema failure; keep the test output clean.
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      harness = await startHarness(mode, (_n, id) => [
        chunk("t0"),
        chunk("t1"),
        { jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION_ID } },
        chunk("t2"),
        chunk("t3"),
        promptResponse(id, "max_tokens"),
      ]);
      const seen: string[] = [];
      harness.port.on("sessionUpdate", (note) => seen.push(textOf(note) ?? "?"));

      const response = await harness.port.prompt(promptParams);
      const atSettle = [...seen];

      expect(response.stopReason).toBe("max_tokens");
      expect(atSettle).toEqual(["t0", "t1", "t2", "t3"]);
    });

    it(`a throwing sessionUpdate listener does not lose the prompt result (${mode})`, async () => {
      harness = await startHarness(mode, (_n, id) => [
        ...texts("t").map(chunk),
        promptResponse(id),
      ]);
      const seen: string[] = [];
      const errors: Error[] = [];
      harness.port.on("sessionUpdate", () => {
        throw new Error("listener blew up");
      });
      harness.port.on("sessionUpdate", (note) => seen.push(textOf(note) ?? "?"));
      harness.port.on("error", (error) => errors.push(error));

      const response = await harness.port.prompt(promptParams);

      expect(response.stopReason).toBe("end_turn");
      expect(errors.map((e) => e.message)).toEqual(Array(N).fill("listener blew up"));
      // The first listener threw before the second could run, so nothing reached it.
      expect(seen).toEqual([]);
    });

    it(`two consecutive prompts each see exactly their own updates (${mode})`, async () => {
      harness = await startHarness(mode, (n, id) => [
        ...texts(`p${n}-`).map(chunk),
        promptResponse(id),
      ]);
      let window: string[] = [];
      harness.port.on("sessionUpdate", (note) => window.push(textOf(note) ?? "?"));

      await harness.port.prompt(promptParams);
      const first = window;
      window = [];
      await harness.port.prompt(promptParams);
      const second = window;

      expect(first).toEqual(texts("p0-"));
      expect(second).toEqual(texts("p1-"));
    });
  }
});
