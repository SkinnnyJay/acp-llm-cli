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
  // `stream` and `debug` are omitted deliberately: CURSOR_GENERIC_FLAG_MAP maps neither, so
  // buildGenericArgs discarded them. Forwarding them read as if they reached the CLI.
  const generic = buildGenericArgs(
    {
      model: config.model,
      outputFormat: config.outputFormat,
      trust: config.trust,
      sandbox: config.sandbox,
      workspace: config.workspace ?? config.workspacePath,
      resume: config.resume,
      verbose: config.verbose,
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
