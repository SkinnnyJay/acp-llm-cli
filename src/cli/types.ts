import type { BaseCliConfig } from "../runtime/config";
import type { GenericFlagMap, GenericLlmCliOptions } from "./generic.options";

/**
 * Options passed to getHelp. Same shape as spawn (command, args, cwd, env).
 */
export interface GetHelpOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

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

  /**
   * Build full argv from config. Config may include generic options and provider-specific fields.
   * Does not include the command name.
   */
  buildArgs(config: TConfig): string[];

  /**
   * Run CLI with --help and return stdout. Uses command/args from config or options.
   */
  getHelp(options: GetHelpOptions): Promise<string>;
}
