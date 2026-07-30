/**
 * Stream prompt example — run against built dist:
 *
 *   npm run build && npx tsx examples/stream-prompt.ts
 *
 * Requires `claude-agent-acp` on PATH and ANTHROPIC_API_KEY.
 * Prints dual-envelope stream chunks (native + OpenAI-style when mode is both).
 */
import {
  ENVELOPE_MODE,
  getDefaultProviderClientFactory,
  isNativeEnvelope,
  isOpenAIEnvelope,
  Provider,
} from "../dist/index.js";

async function main(): Promise<void> {
  const factory = getDefaultProviderClientFactory();
  const client = factory.getClient(
    Provider.CLAUDE,
    { command: "claude-agent-acp", args: [] },
    { envelopeMode: ENVELOPE_MODE.BOTH }
  );

  const port = client.port;
  if (!port.streamPrompt) {
    throw new Error("streamPrompt not available on this port");
  }

  await port.connect();
  await port.initialize();
  const session = await port.newSession({ cwd: process.cwd(), mcpServers: [] });

  for await (const envelope of port.streamPrompt(
    {
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Say hello in one short sentence." }],
    },
    { envelopeMode: ENVELOPE_MODE.BOTH }
  )) {
    if (isOpenAIEnvelope(envelope)) {
      const delta = envelope.choices?.[0]?.delta?.content;
      if (delta) process.stdout.write(delta);
    } else if (isNativeEnvelope(envelope)) {
      // native envelopes are available for debugging / custom consumers
    }
  }
  process.stdout.write("\n");
  await port.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
