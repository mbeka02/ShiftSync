import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const target = process.argv[2];
if (target !== "development" && target !== "production") {
  throw new Error("Target must be development or production.");
}
const envFile = target === "development" ? ".env.local" : ".env.production.local";
const parsed = config({ path: envFile, quiet: true }).parsed ?? {};
if (parsed.NEON_BRANCH !== target) throw new Error(`${envFile} must declare NEON_BRANCH=${target}.`);
if (target === "production" && process.env.ALLOW_PRODUCTION_BOOTSTRAP !== "I_UNDERSTAND_THIS_RESETS_PRODUCTION") {
  throw new Error("Production bootstrap requires ALLOW_PRODUCTION_BOOTSTRAP=I_UNDERSTAND_THIS_RESETS_PRODUCTION.");
}

function run(args: string[], extraEnv: Record<string, string>) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["exec", "tsx", "scripts/reset-database.ts"], { DATABASE_ENV_FILE: envFile });
run(["exec", "drizzle-kit", "migrate"], { DRIZZLE_ENV_FILE: envFile });
run(["exec", "tsx", "scripts/seed.ts"], { SEED_ENV_FILE: envFile });
