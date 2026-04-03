import { spawn } from "node:child_process";
import { ENCODING } from "../../domain/encoding";
import { NODE_EVENT } from "../../domain/node.events";
import { TIMEOUT } from "../../domain/timeouts";
import { mergeEnv } from "../../runtime/env.reader";
import type { CursorConfig } from "./schema";

export interface CursorCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawn Cursor CLI with merged env, collect stdout/stderr, enforce timeout with SIGTERM then SIGKILL.
 */
export function runCursorSpawnedCommand(
  command: string,
  args: string[],
  config: CursorConfig,
  timeoutMs: number = TIMEOUT.CURSOR_PROMPT_MS
): Promise<CursorCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, TIMEOUT.CURSOR_FORCE_KILL_MS);
      resolve({
        stdout,
        stderr: stderr + "\n[timed out after " + timeoutMs + "ms]",
        exitCode: null,
      });
    }, timeoutMs);
    child.on(NODE_EVENT.ERROR, (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on(NODE_EVENT.CLOSE, (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}
