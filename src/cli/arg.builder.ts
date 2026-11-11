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

/** The generic options that take effect on the spawned process. Others are never applied there. */
const SPAWN_OPTION_KEYS = [
  GENERIC_OPTION_KEY.MODEL,
  GENERIC_OPTION_KEY.TRUST,
  GENERIC_OPTION_KEY.SANDBOX,
  GENERIC_OPTION_KEY.WORKSPACE,
] as const;

const hasFlag = (args: readonly string[], flag: string): boolean =>
  args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));

/**
 * Args to spawn with: `args`, then a flag for each of model, trust, sandbox and workspace that is
 * set, mapped by `flagMap`, and not already in `args` (as `--flag` or `--flag=value`).
 */
export function appendGenericArgs(
  options: Partial<GenericLlmCliOptions>,
  flagMap: GenericFlagMap,
  args: string[]
): string[] {
  const spawnMap: GenericFlagMap = {};
  for (const key of SPAWN_OPTION_KEYS) {
    const flag = flagMap[key];
    if (flag && !hasFlag(args, flag)) spawnMap[key] = flag;
  }
  return buildGenericArgs(options, spawnMap, args);
}

/**
 * Result of building full CLI args: command name and argv for spawn/exec.
 */
export interface BuiltCliInvocation {
  command: string;
  args: string[];
}
