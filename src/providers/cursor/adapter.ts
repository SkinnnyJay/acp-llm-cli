import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { resolveBaseConfig } from "../../runtime/config.resolve";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import { createLogger } from "../../runtime/logger";
import type { AcpSharedRuntimeOptions } from "../acp.shared";
import { cursorCliSpec } from "./cli.definition";
import { CURSOR_CONFIG_KEYS } from "./constants";
import { CursorAgentPort } from "./cursor.agent.port";
import type { CursorConfig } from "./schema";
import { cursorConfigSchema } from "./schema";

const LOG_NAME = "CursorAdapter";

/**
 * `providerId` is excluded deliberately: ProviderFactory and bootstrap both set it
 * unconditionally, so warning on it would fire for every cursor construction and teach callers
 * to ignore the warning entirely.
 */
const IGNORED_RUNTIME_OPTION_KEYS = [
  "sessionPersistence",
  "workspace",
  "resumeOnRestart",
  "restartOptions",
  "envelopeMode",
  "modelId",
  "clientCapabilities",
  "permissionHandler",
  "toolHost",
] as const satisfies ReadonlyArray<keyof AcpSharedRuntimeOptions>;

/**
 * Cursor drives `cursor-agent` over print/stream-json rather than ACP, so it has no ACP client,
 * no lifecycle wrapper and no envelope mapper to apply these to - CURSOR_CAPABILITIES reports
 * restart/openClose/sessionPersistence/streamPrompt as false for exactly that reason. The port
 * still accepts the shared options type, so the values used to vanish with no signal at all;
 * capabilities cover four of these concerns but say nothing about the other five.
 */
function warnIgnoredRuntimeOptions(
  runtimeOptions: AcpSharedRuntimeOptions,
  env: CursorConfig["env"]
): void {
  const ignored = IGNORED_RUNTIME_OPTION_KEYS.filter((key) => runtimeOptions[key] !== undefined);
  if (ignored.length === 0) return;
  createLogger(LOG_NAME, { env }).warn(
    "cursor-cli cannot honour these runtime options and is ignoring them",
    { ignored }
  );
}

function createRuntime(config: CursorConfig, runtimeOptions?: AcpSharedRuntimeOptions): IAgentPort {
  if (runtimeOptions) {
    warnIgnoredRuntimeOptions(runtimeOptions, config.env);
  }
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
  const parsed = cursorConfigSchema.parse(resolved);
  return new CursorAgentPort(parsed);
}

export const cursorAdapter = createCliHarnessAdapter<CursorConfig>({
  id: PROVIDER_IDS.CURSOR_CLI_ID,
  name: PROVIDER_IDS.CURSOR_CLI_NAME,
  configSchema: cursorConfigSchema,
  createRuntime,
  cliSpec: cursorCliSpec,
});
