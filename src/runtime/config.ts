import { z } from "zod";

/**
 * Base CLI config schema. Provider configs extend with .merge() or .and().
 */
export const baseCliConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string()).default({}),
});

export type BaseCliConfig = z.infer<typeof baseCliConfigSchema>;
