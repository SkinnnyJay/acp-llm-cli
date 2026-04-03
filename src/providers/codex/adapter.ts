import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import { createStandardAcpRuntime } from "../acp.shared";
import { codexCliSpec } from "./cli.definition";
import { CODEX_CONFIG_KEYS } from "./constants";
import { codexConfigSchema } from "./schema";
import type { CodexConfig } from "./schema";

const createRuntime = (config: CodexConfig): IAgentPort =>
  createStandardAcpRuntime(
    config,
    {
      command: DEFAULT_COMMANDS.CODEX_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.CODEX_DEFAULT_ARGS],
    },
    {
      commandKey: CODEX_CONFIG_KEYS.COMMAND_KEY,
      argsKey: CODEX_CONFIG_KEYS.ARGS_KEY,
    },
    codexConfigSchema
  );

export const codexAdapter = createCliHarnessAdapter<CodexConfig>({
  id: PROVIDER_IDS.CODEX_CLI_ID,
  name: PROVIDER_IDS.CODEX_CLI_NAME,
  configSchema: codexConfigSchema,
  createRuntime,
  cliSpec: codexCliSpec,
});
