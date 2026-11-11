/**
 * Minimal Cursor example over ACP (`cursor-agent acp`) - run against built dist:
 *
 *   npm run build && npx tsx examples/cursor-acp.ts
 *
 * Requires `cursor-agent` on PATH (or ACP_LLM_CLI_CURSOR_COMMAND / _ARGS) and a Cursor login.
 */
import { DEFAULT_COMMANDS, Provider, getDefaultProviderClientFactory } from "../dist/index.js";
import { resolveBaseConfig } from "../dist/runtime/index.js";

async function main(): Promise<void> {
  const factory = getDefaultProviderClientFactory();
  // The factory requires `command`, so resolve default -> env override first.
  const config = resolveBaseConfig(
    {
      command: DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS],
    },
    { commandKey: "ACP_LLM_CLI_CURSOR_COMMAND", argsKey: "ACP_LLM_CLI_CURSOR_ARGS" }
  );
  const client = factory.getClient(Provider.CURSOR, config);

  await client.port.connect();
  // Connected: everything below must release the child process, including on failure.
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
