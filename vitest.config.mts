import { config } from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // PostgreSQL integration tests exercise several real Neon transactions;
    // allow for remote connection latency without weakening assertions.
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: "parallel-integration",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/emergency-coverage.test.ts", "tests/outbox-drain.test.ts"],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "isolated-global-state",
          include: ["tests/emergency-coverage.test.ts"],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: "isolated-outbox",
          include: ["tests/outbox-drain.test.ts"],
          fileParallelism: false,
          setupFiles: ["tests/helpers/prepare-outbox-test.ts"],
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
