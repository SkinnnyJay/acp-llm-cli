import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { CURSOR_CLI_ARG, CURSOR_GENERIC_FLAG_MAP } from "./constants";
import type { CursorConfig } from "./schema";

export const cursorCliSpec = createStandardCliSpec<CursorConfig>(
  DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS,
  CURSOR_GENERIC_FLAG_MAP,
  CURSOR_CLI_ARG
);
