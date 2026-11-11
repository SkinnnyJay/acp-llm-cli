import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import type { AcpSharedRuntimeOptions } from "../acp.shared";
import { createStandardAcpRuntime } from "../acp.shared";
import { antigravityCliSpec } from "./cli.definition";
import { ANTIGRAVITY_CONFIG_KEYS, ANTIGRAVITY_GENERIC_FLAG_MAP } from "./constants";
import type { AntigravityConfig } from "./schema";
import { antigravityConfigSchema } from "./schema";

const createRuntime = (
  config: AntigravityConfig,
  runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort =>
  createStandardAcpRuntime(
    config,
    {
      command: DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_ARGS],
    },
    {
      commandKey: ANTIGRAVITY_CONFIG_KEYS.COMMAND_KEY,
      argsKey: ANTIGRAVITY_CONFIG_KEYS.ARGS_KEY,
    },
    antigravityConfigSchema,
    {
      ...runtimeOptions,
      providerId: runtimeOptions?.providerId ?? PROVIDER_IDS.ANTIGRAVITY_CLI_ID,
    },
    ANTIGRAVITY_GENERIC_FLAG_MAP
  );

export const antigravityAdapter = createCliHarnessAdapter<AntigravityConfig>({
  id: PROVIDER_IDS.ANTIGRAVITY_CLI_ID,
  name: PROVIDER_IDS.ANTIGRAVITY_CLI_NAME,
  configSchema: antigravityConfigSchema,
  createRuntime,
  cliSpec: antigravityCliSpec,
});
