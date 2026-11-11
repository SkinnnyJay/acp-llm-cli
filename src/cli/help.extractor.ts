import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import { ENCODING } from "../domain/encoding";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { ACP_ERROR_CODE, AgentProcessError, TimeoutError } from "../domain/errors";
import { NODE_EVENT, NODE_SPAWN_ERROR } from "../domain/node.events";
import type { ProcessEnv } from "../domain/process.env";
import { SIGNAL } from "../domain/signals";
import { formatStderrForError } from "../domain/stderr.format";
import { TIMEOUT, TIMEOUT_OPERATION } from "../domain/timeouts";
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
      // Install the force-kill timer BEFORE signalling. An injected spawnFn can emit `close`
      // synchronously from kill(), and the close handler's clearTimeout would then run while
      // this variable was still undefined - leaving a SIGKILL timer nothing ever clears, holding
      // the event loop open and later signalling a pid that may have been recycled.
      forceKillTimer = setTimeout(() => {
        child.kill(SIGNAL.KILL);
      }, TIMEOUT.DISCONNECT_FORCE_MS);
      child.kill(SIGNAL.TERM);
      reject(
        new TimeoutError(ACP_ERROR_CODE.TIMEOUT, ERROR_MESSAGE.HELP_EXTRACTION_TIMEOUT(timeoutMs), {
          operation: TIMEOUT_OPERATION.HELP_EXTRACTION,
          timeoutMs,
        })
      );
    }, timeoutMs);

    child.stdout?.setEncoding(ENCODING.UTF8);
    child.stdout?.on(NODE_EVENT.DATA, (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding(ENCODING.UTF8);
    child.stderr?.on(NODE_EVENT.DATA, (chunk: string) => {
      stderr += chunk;
    });

    child.on(NODE_EVENT.ERROR, (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      // Node's own message is kept: callers already match on "spawn <cmd> ENOENT".
      const code =
        err.code === NODE_SPAWN_ERROR.ENOENT
          ? ACP_ERROR_CODE.CLI_NOT_FOUND
          : err.code === NODE_SPAWN_ERROR.EACCES
            ? ACP_ERROR_CODE.CLI_NOT_EXECUTABLE
            : undefined;
      reject(code ? new AgentProcessError(code, err.message, { command, cause: err }) : err);
    });

    // Both close arguments are bound: a child killed by a signal reports code === null, and
    // treating that as success returned whatever had been captured so far as if it were the
    // complete help text. Success is exit 0 and nothing else.
    child.on(NODE_EVENT.CLOSE, (code: number | null, signal: string | null) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      if (code !== 0) {
        const shownStderr = formatStderrForError(stderr, { debug: isDebugEnabled(env) });
        reject(
          new AgentProcessError(
            ACP_ERROR_CODE.PROCESS_EXITED,
            ERROR_MESSAGE.HELP_COMMAND_FAILED(
              code ?? "unknown",
              signal ? ` (signal ${signal})` : "",
              shownStderr
            ),
            { command, exitCode: code, signal, stderr: shownStderr }
          )
        );
        return;
      }
      resolve(stdout || stderr);
    });
  });
}
