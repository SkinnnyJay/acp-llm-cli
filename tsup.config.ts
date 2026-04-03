import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/runtime/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@agentclientprotocol/sdk"],
  noExternal: ["zod", "eventemitter3"],
});
