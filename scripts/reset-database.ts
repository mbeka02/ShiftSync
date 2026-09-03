import { config } from "dotenv";

const envFile = process.env.DATABASE_ENV_FILE;
if (!envFile) throw new Error("DATABASE_ENV_FILE is required.");
config({ path: envFile, override: true, quiet: true });

async function main() {
  const branch = process.env.NEON_BRANCH;
  const productionConfirmed = process.env.ALLOW_PRODUCTION_BOOTSTRAP === "I_UNDERSTAND_THIS_RESETS_PRODUCTION";
  if (branch !== "development" && !(branch === "production" && productionConfirmed)) {
    throw new Error("Refusing database reset: only development or an explicitly authorized production bootstrap is allowed.");
  }
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_UNPOOLED) {
    throw new Error(`Missing database URLs in ${envFile}.`);
  }

  const { getPool, closePool } = await import("@/server/db/pool");
  try {
    const pool = getPool();
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await pool.query("grant all on schema public to public");
    console.log(`Reset the public schema on the Neon ${branch} branch.`);
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
