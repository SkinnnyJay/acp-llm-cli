/**
 * Minimal Claude ACP example — run against built dist:
 *
 *   npm run build && npx tsx examples/minimal-claude.ts
 *
 * Requires `claude-agent-acp` on PATH and ANTHROPIC_API_KEY.
 */
import { ANTHROPIC_MODEL_IDS, Provider, getDefaultProviderClientFactory } from "../dist/index.js";

async function main(): Promise<void> {
  const factory = getDefaultProviderClientFactory();
  const client = factory.getClient(Provider.CLAUDE, {
    command: "claude-agent-acp",
    args: [],
    // `model` labels OpenAI-style stream envelopes. ACP agents select the model over the
    // protocol (setSessionModel, below) - this package does not invent CLI flags for the binary.
    model: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_4_6,
  });

  await client.port.connect();
  // Connected: everything below must release the child process, including on failure.
  try {
    await client.port.initialize();
    const session = await client.port.newSession({ cwd: process.cwd(), mcpServers: [] });

    await client.port.setSessionModel?.({
      sessionId: session.sessionId,
      modelId: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_4_6,
    });

    const result = await client.port.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Reply with exactly: ok" }],
    });
    console.log(JSON.stringify({ stopReason: result.stopReason }, null, 2));
  } finally {
    await client.port.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
