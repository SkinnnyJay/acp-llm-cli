import type { BaseCliConfig } from "../runtime/config";
import { buildGenericArgs } from "./arg.builder";
import type { GenericFlagMap, GenericLlmCliOptions } from "./generic.options";
import { extractHelp } from "./help.extractor";
import type { ICliSpec } from "./types";

export function createStandardCliSpec<TConfig extends BaseCliConfig & GenericLlmCliOptions>(
  defaults: readonly string[],
  flagMap: GenericFlagMap,
  knownFlags: Record<string, string>
): ICliSpec<TConfig> {
  const defaultArgs = [...defaults];

  return {
    defaultArgs,
    genericFlagMap: flagMap,
    knownFlags: { ...knownFlags },
    buildArgs(config: TConfig) {
      const baseArgs = config.args ?? defaultArgs;
      return buildGenericArgs(config, flagMap, baseArgs);
    },
    async getHelp(options) {
      return extractHelp({
        command: options.command,
        args: options.args ?? defaultArgs,
        cwd: options.cwd,
        env: options.env,
      });
    },
  };
}
