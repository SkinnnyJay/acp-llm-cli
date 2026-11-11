import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/runtime/index.ts"],
  format: ["esm"],
  // Keep dist/index.js and dist/index.d.ts, the paths package.json exports.
  fixedExtension: false,
  dts: { sourcemap: false },
  clean: true,
  sourcemap: true,
  deps: { neverBundle: ["@agentclientprotocol/sdk", "zod", "eventemitter3"] },
});
