import { config } from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });
const testEnvironment = config({ path: ".env.test.local", override: true, quiet: true });

if (testEnvironment.error) {
  throw new Error(
    "Missing .env.test.local. Pull the Neon test branch environment before running Vitest.",
    { cause: testEnvironment.error },
  );
}

if (process.env.NEON_BRANCH !== "test") {
  throw new Error(
    `Unsafe Vitest database configuration: expected NEON_BRANCH=test, received ${process.env.NEON_BRANCH ?? "unset"}.`,
  );
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_UNPOOLED) {
  throw new Error("Unsafe Vitest database configuration: test database URLs are missing.");
}

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
