import { config } from "dotenv";

const target = process.argv[2] ?? "development";
if (target !== "development" && target !== "production") {
  throw new Error("Target must be development or production.");
}

const envFile = target === "development" ? ".env.local" : ".env.production.local";
const environment = config({ path: envFile, override: true, quiet: true });
if (environment.error) throw new Error(`Unable to load ${envFile}.`, { cause: environment.error });
if (environment.parsed?.NEON_BRANCH !== target) {
  throw new Error(`${envFile} must declare NEON_BRANCH=${target}.`);
}
if (target === "production"
  && process.env.ALLOW_PRODUCTION_DEMO_REFRESH !== "I_UNDERSTAND_THIS_REPLACES_CURRENT_DEMO_WEEKS") {
  throw new Error("Production refresh requires ALLOW_PRODUCTION_DEMO_REFRESH=I_UNDERSTAND_THIS_REPLACES_CURRENT_DEMO_WEEKS.");
}

async function main() {
  const { refreshDemoScheduleFixtures } = await import("@/server/demo/refresh");
  const result = await refreshDemoScheduleFixtures();
  console.log(`Refreshed ${result.currentWeek} and ${result.scenarioWeek} on Neon ${target}.`);
  console.log(`Created ${result.shifts} shifts, ${result.assignments} assignments, ${result.coverageRequests} coverage requests, and ${result.onDutyEntries} on-duty entry.`);

  const { closePool } = await import("@/server/db/pool");
  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
