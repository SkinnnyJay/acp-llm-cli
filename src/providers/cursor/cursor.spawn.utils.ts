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

/**
 * Spawn Cursor CLI with merged env, collect stdout/stderr, enforce timeout with SIGTERM then SIGKILL.
 * Rejects on timeout so callers receive a typed error instead of a partial success result.
 * Tracks and clears the force-kill timer on normal exit to prevent background zombie timers.
 * The spawnFn parameter is injectable for testing.
 */
export function runCursorSpawnedCommand(
  command: string,
  args: string[],
  config: CursorConfig,
  timeoutMs: number = TIMEOUT.CURSOR_PROMPT_MS,
  spawnFn: CursorSpawnFn = nodeSpawn
): Promise<CursorCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, args, {
      cwd: config.cwd,
      env: mergeEnv(config.env),
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding(ENCODING.UTF8);
    child.stdout?.on(NODE_EVENT.DATA, (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding(ENCODING.UTF8);
    child.stderr?.on(NODE_EVENT.DATA, (chunk: string) => {
      stderr += chunk;
    });

    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutTimer = setTimeout(() => {
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // process may have already exited
        }
      }, TIMEOUT.CURSOR_FORCE_KILL_MS);
      reject(new Error(ERROR_MESSAGE.CURSOR_COMMAND_TIMEOUT(timeoutMs)));
    }, timeoutMs);

    child.on(NODE_EVENT.ERROR, (err) => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      reject(err);
    });

    child.on(NODE_EVENT.CLOSE, (code) => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}
