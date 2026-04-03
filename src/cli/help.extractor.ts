import { spawn } from "node:child_process";
import { ENCODING } from "../domain/encoding";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { NODE_EVENT } from "../domain/node.events";
import { SIGNAL } from "../domain/signals";
import { TIMEOUT } from "../domain/timeouts";
import { mergeEnv } from "../runtime/env.reader";

export const HELP_FLAG = "--help";

export interface HelpExtractorOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/**
 * Run CLI with --help and return stdout. Uses spawn, so no shell escaping of args.
 * Add HELP_FLAG at end unless already present in args.
 */
export function extractHelp(options: HelpExtractorOptions): Promise<string> {
  const { command, args = [], cwd, env, timeoutMs = TIMEOUT.HELP_EXTRACTION_MS } = options;
  const helpArgs = args.includes(HELP_FLAG) ? [...args] : [...args, HELP_FLAG];

  return new Promise((resolve, reject) => {
    const child = spawn(command, helpArgs, {
      cwd,
      env: mergeEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill(SIGNAL.TERM);
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
      reject(err);
    });

    child.on(NODE_EVENT.CLOSE, (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        reject(new Error(ERROR_MESSAGE.HELP_COMMAND_FAILED(code, stderr)));
        return;
      }
      resolve(stdout || stderr);
    });
  });
}
