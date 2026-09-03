import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

const development = config({ path: ".env.local", quiet: true }).parsed ?? {};
const test = config({ path: ".env.test.local", quiet: true }).parsed ?? {};

if (development.NEON_BRANCH !== "development") {
  throw new Error("Expected .env.local to target NEON_BRANCH=development.");
}
if (test.NEON_BRANCH !== "test") {
  throw new Error("Expected .env.test.local to target NEON_BRANCH=test.");
}
if (!development.DATABASE_URL || !test.DATABASE_URL) {
  throw new Error("Both development and test database connection strings are required.");
}
if (development.DATABASE_URL === test.DATABASE_URL) {
  throw new Error("Development and test resolve to the same database connection string.");
}

async function main() {
  const marker = randomUUID();
  const developmentPool = new Pool({ connectionString: development.DATABASE_URL, max: 1 });
  const testPool = new Pool({ connectionString: test.DATABASE_URL, max: 1 });

  try {
    await testPool.query("create table if not exists _shiftsync_isolation_probe (marker text primary key)");
    await testPool.query("insert into _shiftsync_isolation_probe (marker) values ($1)", [marker]);

    const developmentResult = await developmentPool.query<{ relation: string | null }>(
      "select to_regclass('public._shiftsync_isolation_probe')::text as relation",
    );
    if (developmentResult.rows[0]?.relation !== null) {
      throw new Error("Isolation failed: the test-only marker table is visible in development.");
    }

    const testResult = await testPool.query<{ marker: string }>(
      "select marker from _shiftsync_isolation_probe where marker = $1",
      [marker],
    );
    if (testResult.rows[0]?.marker !== marker) {
      throw new Error("Isolation failed: the marker was not persisted in the test branch.");
    }

    console.log("Verified Neon isolation: test writes are not visible in development.");
  } finally {
    await testPool.query("drop table if exists _shiftsync_isolation_probe");
    await Promise.all([developmentPool.end(), testPool.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
