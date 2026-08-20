import { z } from "zod";

/**
 * Base CLI config schema. Provider configs extend with .merge() or .and().
 */
export const baseCliConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
});

export type BaseCliConfig = z.infer<typeof baseCliConfigSchema>;

/** One validation failure, in the shape both supported zod majors emit. */
export interface ConfigSchemaIssue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

/** Aggregate validation failure, in the shape both supported zod majors emit. */
export interface ConfigSchemaError {
  readonly issues: readonly ConfigSchemaIssue[];
  readonly message: string;
}

/** Result of {@link ConfigSchema.safeParse}. */
export type ConfigSchemaResult<TConfig> =
  | { readonly success: true; readonly data: TConfig }
  | { readonly success: false; readonly error: ConfigSchemaError };

/**
 * The slice of a zod schema this package uses to validate provider config.
 *
 * Declared structurally rather than as `z.ZodType<...>` because our supported
 * peer range spans two zod majors that disagree on that type's generics:
 * zod 3 is `ZodType<Output, Def extends ZodTypeDef, Input>`, while zod 4
 * dropped `ZodTypeDef` for `ZodType<Output, Input, Internals>`. No spelling of
 * `z.ZodType` compiles under both - `z.ZodType<T, z.ZodTypeDef, unknown>` fails
 * on 4 because `ZodTypeDef` is gone, and `z.ZodType<T>` fails on 3 because
 * `Input` defaults to `Output` there, which rejects any schema using
 * `.default()`. Every zod schema satisfies this interface structurally.
 */
export interface ConfigSchema<TConfig> {
  parse(data: unknown): TConfig;
  safeParse(data: unknown): ConfigSchemaResult<TConfig>;
}
