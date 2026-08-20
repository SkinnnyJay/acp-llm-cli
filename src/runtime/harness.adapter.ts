import type { z } from "zod";
import type { ICliSpec } from "../cli/types";
import type { AcpSharedRuntimeOptions } from "./acp.runtime";
import type { IAgentPort } from "./agent.port";
import type { BaseCliConfig } from "./config";

/**
 * Harness adapter: creates an IAgentPort (HarnessRuntime) from validated config.
 * Optional cliSpec exposes default args, arg builder, help extractor, and known flags.
 */
export interface IHarnessAdapter<TConfig extends BaseCliConfig = BaseCliConfig> {
  readonly id: string;
  readonly name: string;
  readonly configSchema: z.ZodType<TConfig, z.ZodTypeDef, unknown>;
  createHarness(config: TConfig, runtimeOptions?: AcpSharedRuntimeOptions): IAgentPort;
  /** Optional: CLI commands/args discovery and building. */
  readonly cliSpec?: ICliSpec<TConfig>;
}

/** Alias: harness runtime is an agent port. */
export type HarnessRuntime = IAgentPort;
