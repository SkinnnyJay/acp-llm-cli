import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        // Non-source files
        "**/*.md",
        // Auto-generated model lists
        "src/domain/models/**",
        // Pure provider registration objects — no business logic to test
        "src/providers/*/adapter.ts",
        "src/providers/cursor/cli.definition.ts",
        // Integration-only: requires spawning real CLI processes
        "src/cli/help.extractor.ts",
        "src/providers/cursor/cursor.agent.port.ts",
        // Integration-only: requires a live ACP WebSocket server
        "src/runtime/acp.client.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "#": resolve(__dirname, "src"),
    },
  },
});
