import type { LogMetadata } from "@simpill/logger.utils";
import { getLogger } from "@simpill/logger.utils";
import type { ProcessEnv } from "../domain/process.env";
import { isDebugEnabled } from "./env.reader";

export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function isLogMetadata(value: unknown): value is LogMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toMetadata(args: unknown[]): LogMetadata | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1 && isLogMetadata(args[0])) {
    return args[0];
  }
  return { args };
}

/**
 * Logger backed by @simpill/logger.utils. When options.env (or process.env) has
 * ACP_LLM_CLI_DEBUG falsy, debug() is a no-op.
 */
export function createLogger(name: string, options?: { env?: ProcessEnv }): ILogger {
  const simpillLogger = getLogger(name);
  const debugOn = isDebugEnabled(options?.env);

  return {
    debug(message: string, ...args: unknown[]): void {
      if (debugOn) {
        simpillLogger.debug(message, toMetadata(args));
      }
    },
    info(message: string, ...args: unknown[]): void {
      simpillLogger.info(message, toMetadata(args));
    },
    warn(message: string, ...args: unknown[]): void {
      simpillLogger.warn(message, toMetadata(args));
    },
    error(message: string, ...args: unknown[]): void {
      simpillLogger.error(message, toMetadata(args));
    },
  };
}
