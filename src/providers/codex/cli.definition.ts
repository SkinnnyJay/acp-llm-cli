import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { CODEX_CLI_ARG, CODEX_GENERIC_FLAG_MAP } from "./constants";
import type { CodexConfig } from "./schema";

export const codexCliSpec = createStandardCliSpec<CodexConfig>(
  DEFAULT_COMMANDS.CODEX_DEFAULT_ARGS,
  CODEX_GENERIC_FLAG_MAP,
  CODEX_CLI_ARG
);
