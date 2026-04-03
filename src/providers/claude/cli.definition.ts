import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { CLAUDE_CLI_ARG, CLAUDE_GENERIC_FLAG_MAP } from "./constants";
import type { ClaudeConfig } from "./schema";

export const claudeCliSpec = createStandardCliSpec<ClaudeConfig>(
  DEFAULT_COMMANDS.CLAUDE_DEFAULT_ARGS,
  CLAUDE_GENERIC_FLAG_MAP,
  CLAUDE_CLI_ARG
);
