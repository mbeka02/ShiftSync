import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { assertTestDatabaseEnvironment } from "./server/db/test-guard";

const environmentFile = process.env.DRIZZLE_ENV_FILE ?? ".env.local";
const environment = config({ path: environmentFile, override: true, quiet: true });

if (environment.error) {
  throw new Error(`Unable to load Drizzle environment from ${environmentFile}.`, {
    cause: environment.error,
  });
}

if (environmentFile === ".env.test.local") {
  assertTestDatabaseEnvironment();
}

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL is required for Drizzle Kit.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
