import { config } from "dotenv";

config({ path: ".env.test.local", override: true, quiet: true });

async function main() {
  const { assertTestDatabaseEnvironment } = await import("@/server/db/test-guard");
  assertTestDatabaseEnvironment();

  const { getPool, closePool } = await import("@/server/db/pool");

  try {
    const pool = getPool();
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await pool.query("grant all on schema public to public");
    console.log("Reset the public schema on the Neon test branch.");
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
