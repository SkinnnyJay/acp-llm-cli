/**
 * Compatibility surface. These are runtime composition concerns and now live in
 * `src/runtime/acp.runtime.ts`, so the runtime layer no longer has to import from the
 * providers layer - an inversion of the dependency direction documented in src/README.md.
 */

export type { AcpSharedRuntimeOptions } from "../runtime/acp.runtime";
export {
  createAcpCliHarnessRuntime,
  createStandardAcpRuntime,
} from "../runtime/acp.runtime";
