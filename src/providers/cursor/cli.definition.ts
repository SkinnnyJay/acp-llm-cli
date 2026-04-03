import { buildGenericArgs } from "../../cli/arg.builder";
import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import type { ICliSpec } from "../../cli/types";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { CURSOR_CLI_ARG, CURSOR_GENERIC_FLAG_MAP } from "./constants";
import type { CursorConfig } from "./schema";

const baseCliSpec = createStandardCliSpec<CursorConfig>(
  DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS,
  CURSOR_GENERIC_FLAG_MAP,
  CURSOR_CLI_ARG
);

function buildArgs(config: CursorConfig): string[] {
  const baseArgs = config.args ?? [...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS];
  const generic = buildGenericArgs(
    {
      model: config.model,
      outputFormat: config.outputFormat,
      stream: config.stream,
      trust: config.trust,
      sandbox: config.sandbox,
      workspace: config.workspace ?? config.workspacePath,
      resume: config.resume,
      verbose: config.verbose,
      debug: config.debug,
      print: config.print,
    },
    CURSOR_GENERIC_FLAG_MAP,
    baseArgs
  );
  if (config.mode !== undefined) {
    generic.push(CURSOR_CLI_ARG.MODE, config.mode);
  }
  return generic;
}

export const cursorCliSpec: ICliSpec<CursorConfig> = {
  ...baseCliSpec,
  buildArgs,
};
