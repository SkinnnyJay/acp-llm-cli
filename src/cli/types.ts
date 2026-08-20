import type { ProcessEnv } from "../domain/process.env";
import type { BaseCliConfig } from "../runtime/config";
import type { GenericFlagMap, GenericLlmCliOptions } from "./generic.options";

/**
 * Options passed to getHelp. Same shape as spawn (command, args, cwd, env).
 */
export interface GetHelpOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: ProcessEnv;
}

/**
 * What {@link ICliSpec.buildArgs} accepts.
 *
 * Two adjustments to the provider config type, both because that type
 * describes a config after Zod has parsed it rather than what a caller holds:
 *
 * - Generic options are spelled out. Provider configs already carry them, but
 *   a spec reached through the registry erases to `ICliSpec<BaseCliConfig>`,
 *   which would otherwise reject the very options this builder exists to map.
 * - `args` and `env` become optional. They are only required on the parsed
 *   type because their schemas supply defaults, and buildArgs falls back to
 *   `defaultArgs` when `args` is absent.
 */
export type CliArgsInput<TConfig extends BaseCliConfig = BaseCliConfig> = Omit<
  TConfig,
  "args" | "env"
> &
  Partial<Pick<TConfig, "args" | "env">> &
  Partial<GenericLlmCliOptions>;

/**
 * Describes a provider's CLI surface: default args, arg builder, help extraction, and known flags.
 * Adapters can implement this so consumers can discover and build CLI invocations without magic strings.
 */
export interface ICliSpec<TConfig extends BaseCliConfig = BaseCliConfig> {
  /** Default argv (no command) used when no overrides. From DEFAULT_COMMANDS or provider defaults. */
  readonly defaultArgs: string[];

  /** Map of generic option keys to this provider's flag strings. Exposed for discovery and tooling. */
  readonly genericFlagMap: GenericFlagMap;

  /** Provider-specific flag names (e.g. CURSOR_CLI_ARG). Keys are semantic names, values are CLI strings. */
  readonly knownFlags: Record<string, string>;

  /** Build full argv from config. Does not include the command name. */
  buildArgs(config: CliArgsInput<TConfig>): string[];

  /**
   * Run CLI with --help and return stdout. Uses command/args from config or options.
   */
  getHelp(options: GetHelpOptions): Promise<string>;
}
