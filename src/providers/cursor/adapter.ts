import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { resolveBaseConfig } from "../../runtime/config.resolve";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import type { AcpSharedRuntimeOptions } from "../acp.shared";
import { cursorCliSpec } from "./cli.definition";
import { CURSOR_CONFIG_KEYS } from "./constants";
import { CursorAgentPort } from "./cursor.agent.port";
import { cursorConfigSchema } from "./schema";
import type { CursorConfig } from "./schema";

function createRuntime(
  config: CursorConfig,
  _runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort {
  const resolved = resolveBaseConfig(
    {
      command: DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS],
    },
    {
      commandKey: CURSOR_CONFIG_KEYS.COMMAND_KEY,
      argsKey: CURSOR_CONFIG_KEYS.ARGS_KEY,
    },
    config
  );
  // Spread config underneath the resolved base so cursor-specific fields (trust, mode, model,
  // workspacePath, ...) survive; CursorAgentPort reads them at spawn time.
  const parsed = cursorConfigSchema.parse({ ...config, ...resolved });
  return new CursorAgentPort(parsed);
}

export const cursorAdapter = createCliHarnessAdapter<CursorConfig>({
  id: PROVIDER_IDS.CURSOR_CLI_ID,
  name: PROVIDER_IDS.CURSOR_CLI_NAME,
  configSchema: cursorConfigSchema,
  createRuntime,
  cliSpec: cursorCliSpec,
});
