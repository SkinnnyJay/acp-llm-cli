import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "**/*.md",
        // Generated constant tables with no branches. The provider adapters used to be excluded
        // by the same glob, which conflated "data" with "wiring" and hid the config-drop bug -
        // two of the four adapters' createRuntime bodies executed in no test at all.
        "src/domain/models/**",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
