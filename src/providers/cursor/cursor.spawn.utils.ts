import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { ENCODING } from "../../domain/encoding";
import { ERROR_MESSAGE } from "../../domain/error.messages";
import { NODE_EVENT } from "../../domain/node.events";
import { TIMEOUT } from "../../domain/timeouts";
import { mergeEnv } from "../../runtime/env.reader";
import type { CursorConfig } from "./schema";

export interface CursorCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type CursorSpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv }
) => ChildProcessWithoutNullStreams;

export interface CursorSpawnOptions {
  timeoutMs?: number;
  spawnFn?: CursorSpawnFn;
  signal?: AbortSignal;
}

/**
 * Spawn Cursor CLI with merged env, collect stdout/stderr, enforce timeout with SIGTERM then SIGKILL.
 * Supports AbortSignal to kill the child on disconnect.
 * Legacy signature: (cmd, args, config, timeoutMs, spawnFn) still works.
 */
export function runCursorSpawnedCommand(
  command: string,
  args: string[],
  config: CursorConfig,
  timeoutMsOrOptions: number | CursorSpawnOptions = TIMEOUT.CURSOR_PROMPT_MS,
  spawnFnLegacy?: CursorSpawnFn
): Promise<CursorCommandResult> {
  const options: CursorSpawnOptions =
    typeof timeoutMsOrOptions === "number"
      ? { timeoutMs: timeoutMsOrOptions, spawnFn: spawnFnLegacy }
      : timeoutMsOrOptions;
  const timeoutMs = options.timeoutMs ?? TIMEOUT.CURSOR_PROMPT_MS;
  const spawnFn = options.spawnFn ?? nodeSpawn;
  const signal = options.signal;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Cursor CLI command aborted"));
      return;
    }

    const child = spawnFn(command, args, {
      cwd: config.cwd,
      env: mergeEnv(config.env),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    child.stdout?.setEncoding(ENCODING.UTF8);
    child.stdout?.on(NODE_EVENT.DATA, (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding(ENCODING.UTF8);
    child.stderr?.on(NODE_EVENT.DATA, (chunk: string) => {
      stderr += chunk;
    });

    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const settleResolve = (result: CursorCommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const killChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // process may have already exited
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // process may have already exited
        }
      }, TIMEOUT.CURSOR_FORCE_KILL_MS);
    };

    const onAbort = () => {
      clearTimeout(timeoutTimer);
      killChild();
      settleReject(new Error("Cursor CLI command aborted"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutTimer = setTimeout(() => {
      killChild();
      settleReject(new Error(ERROR_MESSAGE.CURSOR_COMMAND_TIMEOUT(timeoutMs)));
    }, timeoutMs);

    child.on(NODE_EVENT.ERROR, (err) => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
      settleReject(err);
    });

    child.on(NODE_EVENT.CLOSE, (code) => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
      settleResolve({ stdout, stderr, exitCode: code });
    });
  });
}
