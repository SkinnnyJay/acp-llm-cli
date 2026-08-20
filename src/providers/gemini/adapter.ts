import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import type { AcpSharedRuntimeOptions } from "../acp.shared";
import { createStandardAcpRuntime } from "../acp.shared";
import { geminiCliSpec } from "./cli.definition";
import { GEMINI_CONFIG_KEYS } from "./constants";
import type { GeminiConfig } from "./schema";
import { geminiConfigSchema } from "./schema";

const createRuntime = (
  config: GeminiConfig,
  runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort =>
  createStandardAcpRuntime(
    config,
    {
      command: DEFAULT_COMMANDS.GEMINI_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.GEMINI_DEFAULT_ARGS],
    },
    {
      commandKey: GEMINI_CONFIG_KEYS.COMMAND_KEY,
      argsKey: GEMINI_CONFIG_KEYS.ARGS_KEY,
    },
    geminiConfigSchema,
    {
      ...runtimeOptions,
      providerId: runtimeOptions?.providerId ?? PROVIDER_IDS.GEMINI_CLI_ID,
    }
  );

export const geminiAdapter = createCliHarnessAdapter<GeminiConfig>({
  id: PROVIDER_IDS.GEMINI_CLI_ID,
  name: PROVIDER_IDS.GEMINI_CLI_NAME,
  configSchema: geminiConfigSchema,
  createRuntime,
  cliSpec: geminiCliSpec,
});
