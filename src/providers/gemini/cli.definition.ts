import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { GEMINI_CLI_ARG, GEMINI_GENERIC_FLAG_MAP } from "./constants";
import type { GeminiConfig } from "./schema";

export const geminiCliSpec = createStandardCliSpec<GeminiConfig>(
  DEFAULT_COMMANDS.GEMINI_DEFAULT_ARGS,
  GEMINI_GENERIC_FLAG_MAP,
  GEMINI_CLI_ARG
);
