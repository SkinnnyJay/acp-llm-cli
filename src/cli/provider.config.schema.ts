import { baseCliConfigSchema } from "../runtime/config";
import { genericLlmCliOptionsSchema } from "./generic.options";

/**
 * Config shared by the ACP wrapper providers: base command/args/cwd/env plus the generic CLI
 * options, with `model` as a free-form string.
 *
 * This used to be `createProviderConfigSchema(vendorModelSchema)`, taking each provider's model
 * enum and emitting `z.union([vendorEnum, z.string()])`. That union accepts a strict superset of
 * any enum, so the vendor schema rejected nothing at runtime, and `z.infer` widened
 * `"a" | "b" | string` back to `string` - leaving the type parameter with no effect on either
 * parsing or the inferred type, and making all three provider config types structurally
 * identical. The vendor enums remain exported (ANTHROPIC_MODEL_IDS and friends) for callers who
 * want real validation; accepting any string is deliberate, so a model released this morning is
 * never blocked by this package's release cadence.
 */
export const acpCliConfigSchema = baseCliConfigSchema.and(genericLlmCliOptionsSchema.partial());
