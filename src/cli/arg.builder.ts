import type { GenericFlagMap, GenericLlmCliOptions } from "./generic.options";
import { GENERIC_OPTION_KEY } from "./generic.options";

/**
 * Builds argv from generic options and a provider flag map. Only emits flags for
 * options that are set; skips keys not present in flagMap. Base args are prepended.
 */
export function buildGenericArgs(
  options: Partial<GenericLlmCliOptions>,
  flagMap: GenericFlagMap,
  baseArgs: string[] = []
): string[] {
  const out = [...baseArgs];

  if (options.model !== undefined && options.model !== "") {
    const flag = flagMap[GENERIC_OPTION_KEY.MODEL];
    if (flag) out.push(flag, options.model);
  }
  if (options.outputFormat !== undefined) {
    const flag = flagMap[GENERIC_OPTION_KEY.OUTPUT_FORMAT];
    if (flag) out.push(flag, options.outputFormat);
  }
  if (options.trust === true) {
    const flag = flagMap[GENERIC_OPTION_KEY.TRUST];
    if (flag) out.push(flag);
  }
  if (options.sandbox !== undefined) {
    const flag = flagMap[GENERIC_OPTION_KEY.SANDBOX];
    if (flag) out.push(flag, options.sandbox);
  }
  if (options.workspace !== undefined && options.workspace !== "") {
    const flag = flagMap[GENERIC_OPTION_KEY.WORKSPACE];
    if (flag) out.push(flag, options.workspace);
  }
  if (options.debug === true) {
    const flag = flagMap[GENERIC_OPTION_KEY.DEBUG];
    if (flag) out.push(flag);
  }

  return out;
}

/**
 * Result of building full CLI args: command name and argv for spawn/exec.
 */
export interface BuiltCliInvocation {
  command: string;
  args: string[];
}
