/**
 * Cursor print-mode example — run against built dist:
 *
 *   npm run build && npx tsx examples/cursor-print.ts
 *
 * Requires `cursor-agent` on PATH. Pass trust: true only if you intend to enable --trust,
 * which really does reach the CLI - it is not a no-op.
 */
import { Provider, getDefaultProviderClientFactory } from "../dist/index.js";

async function main(): Promise<void> {
  const factory = getDefaultProviderClientFactory();
  const client = factory.getClient(Provider.CURSOR, {
    command: "cursor-agent",
    args: [],
    // trust defaults to false (safe). Set trust: true to pass --trust.
  });

  await client.port.connect();
  try {
    await client.port.initialize();
    const session = await client.port.newSession({ cwd: process.cwd(), mcpServers: [] });
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
