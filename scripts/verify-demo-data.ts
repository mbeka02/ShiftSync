import { config } from "dotenv";

const envFile = process.env.VERIFY_ENV_FILE ?? ".env.local";
if (envFile !== ".env.local") config({ path: ".env.local", quiet: true });
config({ path: envFile, override: true, quiet: true });

const emails = [
  "admin@shiftsync.local",
  "manager.east@shiftsync.local",
  "manager.west@shiftsync.local",
  "maria@shiftsync.local",
  "coverage@shiftsync.local",
];

async function main() {
  const { count } = await import("drizzle-orm");
  const { auth } = await import("@/server/auth");
  const { db } = await import("@/server/db");
  const { locations, staffProfiles } = await import("@/server/db/schema");
  const [[locationCount], [staffCount]] = await Promise.all([
    db.select({ value: count() }).from(locations),
    db.select({ value: count() }).from(staffProfiles),
  ]);
  if (locationCount.value !== 4 || staffCount.value !== 20) {
    throw new Error(`Unexpected demo counts: ${locationCount.value} locations, ${staffCount.value} staff.`);
  }
  for (const email of emails) {
    const result = await auth.api.signInEmail({ body: { email, password: "ShiftSyncDemo!2026" } });
    if (!result.user?.id) throw new Error(`Demo login failed for ${email}.`);
  }
  console.log(`Verified 4 locations, 20 staff, and ${emails.length} documented logins on ${process.env.NEON_BRANCH}.`);
  const { closePool } = await import("@/server/db/pool");
  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
