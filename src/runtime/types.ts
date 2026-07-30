import type { ProcessEnv } from "../domain/process.env";

/**
 * Internal stream/connection types and spawn options. Reference constants for defaults where types carry optional overrides.
 */
export interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: ProcessEnv;
}
