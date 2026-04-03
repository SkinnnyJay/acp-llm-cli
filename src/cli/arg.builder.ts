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
  if (options.inputFormat !== undefined) {
    const flag = flagMap[GENERIC_OPTION_KEY.INPUT_FORMAT];
    if (flag) out.push(flag, options.inputFormat);
  }
  if (options.stream === true) {
    const flag = flagMap[GENERIC_OPTION_KEY.STREAM];
    if (flag) out.push(flag);
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
  if (options.resume !== undefined && options.resume !== "") {
    const flag = flagMap[GENERIC_OPTION_KEY.RESUME];
    if (flag) out.push(flag, options.resume);
  }
  if (options.sessionId !== undefined && options.sessionId !== "") {
    const flag = flagMap[GENERIC_OPTION_KEY.SESSION_ID];
    if (flag) out.push(flag, options.sessionId);
  }
  if (options.verbose === true) {
    const flag = flagMap[GENERIC_OPTION_KEY.VERBOSE];
    if (flag) out.push(flag);
  }
  if (options.debug === true) {
    const flag = flagMap[GENERIC_OPTION_KEY.DEBUG];
    if (flag) out.push(flag);
  }
  if (options.print === true) {
    const flag = flagMap[GENERIC_OPTION_KEY.PRINT];
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
