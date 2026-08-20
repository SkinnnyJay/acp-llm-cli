import type { ICliSpec } from "../cli/types";
import type { AcpSharedRuntimeOptions } from "../providers/acp.shared";
import type { IAgentPort } from "./agent.port";
import type { BaseCliConfig, ConfigSchema } from "./config";

/**
 * Harness adapter: creates an IAgentPort (HarnessRuntime) from validated config.
 * Optional cliSpec exposes default args, arg builder, help extractor, and known flags.
 */
export interface IHarnessAdapter<TConfig extends BaseCliConfig = BaseCliConfig> {
  readonly id: string;
  readonly name: string;
  readonly configSchema: ConfigSchema<TConfig>;
  createHarness(config: TConfig, runtimeOptions?: AcpSharedRuntimeOptions): IAgentPort;
  /** Optional: CLI commands/args discovery and building. */
  readonly cliSpec?: ICliSpec<TConfig>;
}

/** Alias: harness runtime is an agent port. */
export type HarnessRuntime = IAgentPort;
