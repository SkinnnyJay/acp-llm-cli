import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import { ENCODING } from "../domain/encoding";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { NODE_EVENT } from "../domain/node.events";
import type { ProcessEnv } from "../domain/process.env";
import { SIGNAL } from "../domain/signals";
import { formatStderrForError } from "../domain/stderr.format";
import { TIMEOUT } from "../domain/timeouts";
import { isDebugEnabled, mergeEnv } from "../runtime/env.reader";

export const HELP_FLAG = "--help";

export type HelpSpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: ProcessEnv; stdio: ["ignore", "pipe", "pipe"] }
) => ChildProcessWithoutNullStreams;

export interface HelpExtractorOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: ProcessEnv;
  timeoutMs?: number;
  /** Injectable for tests; defaults to node:child_process spawn. */
  spawnFn?: HelpSpawnFn;
}

/**
 * Run CLI with --help and return stdout. Uses spawn, so no shell escaping of args.
 * On timeout: SIGTERM then SIGKILL after the force-kill grace window.
 */
export function extractHelp(options: HelpExtractorOptions): Promise<string> {
  const {
    command,
    args = [],
    cwd,
    env,
    timeoutMs = TIMEOUT.HELP_EXTRACTION_MS,
    spawnFn = nodeSpawn,
  } = options;
  const helpArgs = args.includes(HELP_FLAG) ? [...args] : [...args, HELP_FLAG];

  return new Promise((resolve, reject) => {
    const child = spawnFn(command, helpArgs, {
      cwd,
      env: mergeEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const timeout = setTimeout(() => {
      child.kill(SIGNAL.TERM);
      forceKillTimer = setTimeout(() => {
        child.kill(SIGNAL.KILL);
      }, TIMEOUT.DISCONNECT_FORCE_MS);
      reject(new Error(ERROR_MESSAGE.HELP_EXTRACTION_TIMEOUT(timeoutMs)));
    }, timeoutMs);

    child.stdout?.setEncoding(ENCODING.UTF8);
    child.stdout?.on(NODE_EVENT.DATA, (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding(ENCODING.UTF8);
    child.stderr?.on(NODE_EVENT.DATA, (chunk: string) => {
      stderr += chunk;
    });

    child.on(NODE_EVENT.ERROR, (err) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      reject(err);
    });

    child.on(NODE_EVENT.CLOSE, (code) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      if (code !== 0 && code !== null) {
        reject(
          new Error(
            ERROR_MESSAGE.HELP_COMMAND_FAILED(
              code,
              formatStderrForError(stderr, { debug: isDebugEnabled(env) })
            )
          )
        );
        return;
      }
      resolve(stdout || stderr);
    });
  });
}
