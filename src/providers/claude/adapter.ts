import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import type { AcpSharedRuntimeOptions } from "../acp.shared";
import { createStandardAcpRuntime } from "../acp.shared";
import { claudeCliSpec } from "./cli.definition";
import { CLAUDE_CONFIG_KEYS } from "./constants";
import type { ClaudeConfig } from "./schema";
import { claudeConfigSchema } from "./schema";

const createRuntime = (
  config: ClaudeConfig,
  runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort =>
  createStandardAcpRuntime(
    config,
    {
      command: DEFAULT_COMMANDS.CLAUDE_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.CLAUDE_DEFAULT_ARGS],
    },
    {
      commandKey: CLAUDE_CONFIG_KEYS.COMMAND_KEY,
      argsKey: CLAUDE_CONFIG_KEYS.ARGS_KEY,
    },
    claudeConfigSchema,
    {
      ...runtimeOptions,
      providerId: runtimeOptions?.providerId ?? PROVIDER_IDS.CLAUDE_CLI_ID,
    }
  );

export const claudeAdapter = createCliHarnessAdapter<ClaudeConfig>({
  id: PROVIDER_IDS.CLAUDE_CLI_ID,
  name: PROVIDER_IDS.CLAUDE_CLI_NAME,
  configSchema: claudeConfigSchema,
  createRuntime,
  cliSpec: claudeCliSpec,
});
