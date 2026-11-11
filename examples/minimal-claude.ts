/**
 * Minimal Claude ACP example — run against built dist:
 *
 *   npm run build && npx tsx examples/minimal-claude.ts
 *
 * Requires `claude-agent-acp` on PATH (or ACP_LLM_CLI_CLAUDE_COMMAND / _ARGS) and ANTHROPIC_API_KEY.
 */
import {
  ANTHROPIC_MODEL_IDS,
  DEFAULT_COMMANDS,
  Provider,
  getDefaultProviderClientFactory,
} from "../dist/index.js";
import { resolveBaseConfig } from "../dist/runtime/index.js";

async function main(): Promise<void> {
  const factory = getDefaultProviderClientFactory();
  // The factory requires `command`, so resolve default -> env override first.
  const config = resolveBaseConfig<{ model: string; command?: string }>(
    {
      command: DEFAULT_COMMANDS.CLAUDE_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.CLAUDE_DEFAULT_ARGS],
    },
    { commandKey: "ACP_LLM_CLI_CLAUDE_COMMAND", argsKey: "ACP_LLM_CLI_CLAUDE_ARGS" },
    {
      // `model` labels OpenAI-style stream envelopes. ACP agents select the model over the
      // protocol (setSessionConfigOption, below) - this package does not invent CLI flags for the binary.
      model: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_4_6,
    }
  );
  const client = factory.getClient(Provider.CLAUDE, config);

  await client.port.connect();
  // Connected: everything below must release the child process, including on failure.
  try {
    await client.port.initialize();
    const session = await client.port.newSession({ cwd: process.cwd(), mcpServers: [] });

    // ACP replaced session/set_model with the general session/set_config_option,
    // where the model selector is an option carrying `category: "model"`.
    await client.port.setSessionConfigOption?.({
      sessionId: session.sessionId,
      configId: "model",
      value: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_4_6,
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
