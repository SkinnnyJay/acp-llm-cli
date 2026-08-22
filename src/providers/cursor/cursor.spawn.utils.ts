import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import { ENCODING } from "../../domain/encoding";
import { ERROR_MESSAGE } from "../../domain/error.messages";
import { NODE_EVENT } from "../../domain/node.events";
import type { ProcessEnv } from "../../domain/process.env";
import { SIGNAL } from "../../domain/signals";
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
  options: { cwd?: string; env?: ProcessEnv }
) => ChildProcessWithoutNullStreams;

export interface CursorSpawnOptions {
  timeoutMs?: number;
  spawnFn?: CursorSpawnFn;
  signal?: AbortSignal;
}

/**
 * Spawn Cursor CLI with merged env, collect stdout/stderr, enforce timeout with SIGTERM then SIGKILL.
 * Supports AbortSignal to kill the child on disconnect.
 *
 * A legacy positional form - (cmd, args, config, timeoutMs, spawnFn) - used to be accepted
 * alongside the options record. Because the fourth parameter was a two-shape union and the fifth
 * was meaningful under only one of them, `(cmd, args, cfg, { timeoutMs: 50 }, fakeSpawn)`
 * type-checked while silently discarding fakeSpawn - so a unit test could spawn a real
 * cursor-agent process. The legacy form also could not express `signal` at all, which is the one
 * capability runTracked depends on to abort in-flight work.
 */
export function runCursorSpawnedCommand(
  command: string,
  args: string[],
  config: CursorConfig,
  options: CursorSpawnOptions = {}
): Promise<CursorCommandResult> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT.CURSOR_PROMPT_MS;
  const spawnFn = options.spawnFn ?? nodeSpawn;
  const signal = options.signal;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(ERROR_MESSAGE.CURSOR_COMMAND_ABORTED));
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
        child.kill(SIGNAL.TERM);
      } catch {
        // process may have already exited
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill(SIGNAL.KILL);
        } catch {
          // process may have already exited
        }
      }, TIMEOUT.CURSOR_FORCE_KILL_MS);
    };

    const onAbort = () => {
      clearTimeout(timeoutTimer);
      killChild();
      settleReject(new Error(ERROR_MESSAGE.CURSOR_COMMAND_ABORTED));
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
