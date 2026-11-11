import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { ANTIGRAVITY_CLI_ARG, ANTIGRAVITY_GENERIC_FLAG_MAP } from "./constants";
import type { AntigravityConfig } from "./schema";

export const antigravityCliSpec = createStandardCliSpec<AntigravityConfig>(
  DEFAULT_COMMANDS.ANTIGRAVITY_DEFAULT_ARGS,
  ANTIGRAVITY_GENERIC_FLAG_MAP,
  ANTIGRAVITY_CLI_ARG
);
