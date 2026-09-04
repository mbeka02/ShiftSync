import { config } from "dotenv";

const seedEnvFile = process.env.SEED_ENV_FILE ?? ".env.local";
if (seedEnvFile !== ".env.local") config({ path: ".env.local", quiet: true });
config({ path: seedEnvFile, override: true, quiet: true });

const DEMO_PASSWORD = "ShiftSyncDemo!2026";

async function seed() {
  const branch = process.env.NEON_BRANCH;
  const productionConfirmed = process.env.ALLOW_PRODUCTION_BOOTSTRAP === "I_UNDERSTAND_THIS_RESETS_PRODUCTION";
  if (branch !== "development" && !(branch === "production" && productionConfirmed)) {
    throw new Error("Refusing to reset demo data: use development, or explicitly authorize the one-time production bootstrap.");
  }

  const { hashPassword } = await import("better-auth/crypto");
  const { auth } = await import("@/server/auth");
  const { db } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");

  await db.transaction(async (tx) => {
    for (const table of [
      schema.outboxEvents,
      schema.notifications,
      schema.auditLogs,
      schema.timeEntries,
      schema.coverageRequests,
      schema.assignmentPeriods,
      schema.assignments,
      schema.shifts,
      schema.scheduleWeeks,
      schema.availabilityExceptions,
      schema.availabilityRules,
      schema.staffLocationCertifications,
      schema.staffSkills,
      schema.managerLocations,
      schema.notificationPreferences,
      schema.staffCompensation,
      schema.staffProfiles,
      schema.userRoles,
      schema.session,
      schema.account,
      schema.userProfiles,
      schema.roles,
      schema.locations,
      schema.skills,
      schema.verification,
      schema.user,
    ]) await tx.delete(table);
  });

  const roleRows = await db.insert(schema.roles).values([
    { code: "admin", name: "Admin" },
    { code: "manager", name: "Manager" },
    { code: "staff", name: "Staff" },
  ]).returning({ id: schema.roles.id, code: schema.roles.code });
  const roleIds = Object.fromEntries(roleRows.map((role) => [role.code, role.id]));

  async function createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    role: "admin" | "manager" | "staff";
    timezone?: string;
    desiredHours?: number;
    hourlyRate?: number;
  }) {
    const created = await auth.api.signUpEmail({ body: { email: input.email, password: DEMO_PASSWORD, name: `${input.firstName} ${input.lastName}` } });
    const userId = created.user.id;
    await db.insert(schema.userProfiles).values({ userId, firstName: input.firstName, lastName: input.lastName });
    await db.insert(schema.userRoles).values({ userId, roleId: roleIds[input.role] });
    await db.update(schema.account).set({ password: await hashPassword(DEMO_PASSWORD), updatedAt: new Date() }).where(and(
      eq(schema.account.userId, userId),
      eq(schema.account.providerId, "credential"),
    ));
    if (input.role === "staff") {
      await db.insert(schema.staffProfiles).values({
        userId,
        desiredWeeklyHours: input.desiredHours ?? 32,
        primaryTimezone: input.timezone ?? "America/New_York",
        employmentStartDate: "2025-01-01",
      });
      await db.insert(schema.staffCompensation).values({ staffId: userId, hourlyRate: input.hourlyRate ?? 20, effectiveFrom: "2025-01-01" });
    }
    return userId;
  }

  await createUser({ email: "admin@shiftsync.local", firstName: "Avery", lastName: "Morgan", role: "admin" });
  const eastManagerId = await createUser({ email: "manager.east@shiftsync.local", firstName: "Alex", lastName: "Rivera", role: "manager" });
  const westManagerId = await createUser({ email: "manager.west@shiftsync.local", firstName: "Morgan", lastName: "Brooks", role: "manager" });
  const staffInputs = [
    ["maria@shiftsync.local", "Maria", "Chen", "America/New_York", 35, 24],
    ["coverage@shiftsync.local", "Jordan", "Lee", "America/New_York", 40, 23],
    ["priya@shiftsync.local", "Priya", "Shah", "America/New_York", 32, 21],
    ["devon@shiftsync.local", "Devon", "Price", "America/New_York", 40, 25],
    ["casey@shiftsync.local", "Casey", "Wright", "America/New_York", 30, 22],
    ["luis@shiftsync.local", "Luis", "Ortiz", "America/New_York", 32, 20],
    ["nina@shiftsync.local", "Nina", "Patel", "America/New_York", 28, 21],
    ["omar@shiftsync.local", "Omar", "Hassan", "America/New_York", 32, 22],
    ["zoe@shiftsync.local", "Zoe", "Kim", "America/New_York", 24, 19],
    ["eli@shiftsync.local", "Eli", "Cooper", "America/New_York", 30, 20],
    ["sofia@shiftsync.local", "Sofia", "Ramirez", "America/Los_Angeles", 35, 24],
    ["mateo@shiftsync.local", "Mateo", "Silva", "America/Los_Angeles", 40, 23],
    ["aisha@shiftsync.local", "Aisha", "Johnson", "America/Los_Angeles", 32, 21],
    ["noah@shiftsync.local", "Noah", "Nguyen", "America/Los_Angeles", 40, 25],
    ["grace@shiftsync.local", "Grace", "Park", "America/Los_Angeles", 30, 22],
    ["leo@shiftsync.local", "Leo", "Martinez", "America/Los_Angeles", 32, 20],
    ["maya@shiftsync.local", "Maya", "Singh", "America/Los_Angeles", 28, 21],
    ["ethan@shiftsync.local", "Ethan", "Brown", "America/Los_Angeles", 32, 22],
    ["chloe@shiftsync.local", "Chloe", "Wilson", "America/Los_Angeles", 24, 19],
    ["ben@shiftsync.local", "Ben", "Taylor", "America/Los_Angeles", 30, 20],
  ] as const;
  const staffIds: Record<string, string> = {};
  for (const [email, firstName, lastName, timezone, desiredHours, hourlyRate] of staffInputs) {
    staffIds[email] = await createUser({ email, firstName, lastName, role: "staff", timezone, desiredHours, hourlyRate });
  }

  const locationRows = await db.insert(schema.locations).values([
    { name: "Harbor East", timezone: "America/New_York" },
    { name: "Midtown Table", timezone: "America/New_York" },
    { name: "Pacific Pier", timezone: "America/Los_Angeles" },
    { name: "Sunset Kitchen", timezone: "America/Los_Angeles" },
  ]).returning({ id: schema.locations.id, name: schema.locations.name, timezone: schema.locations.timezone });
  const locationByName = Object.fromEntries(locationRows.map((location) => [location.name, location]));
  const eastLocations = [locationByName["Harbor East"], locationByName["Midtown Table"]];
  const westLocations = [locationByName["Pacific Pier"], locationByName["Sunset Kitchen"]];
  await db.insert(schema.managerLocations).values([
    ...eastLocations.map((location) => ({ managerUserId: eastManagerId, locationId: location.id, validFrom: "2025-01-01" })),
    ...westLocations.map((location) => ({ managerUserId: westManagerId, locationId: location.id, validFrom: "2025-01-01" })),
  ]);

  const skillRows = await db.insert(schema.skills).values([
    { code: "server", name: "Server" },
    { code: "bartender", name: "Bartender" },
    { code: "line-cook", name: "Line cook" },
    { code: "host", name: "Host" },
  ]).returning({ id: schema.skills.id, code: schema.skills.code });
  const skillIds = Object.fromEntries(skillRows.map((skill) => [skill.code, skill.id]));
  for (const [index, input] of staffInputs.entries()) {
    const [email, , , timezone] = input;
    const userId = staffIds[email];
    const assignedLocations = index < 10 ? eastLocations : westLocations;
    await db.insert(schema.staffLocationCertifications).values(assignedLocations.map((location) => ({ staffId: userId, locationId: location.id, validFrom: "2025-01-01", status: "active" as const })));
    const primarySkill = ["server", "bartender", "line-cook", "host"][index % 4];
    await db.insert(schema.staffSkills).values([
      { staffId: userId, skillId: skillIds.server, validFrom: "2025-01-01" },
      ...(primarySkill === "server" ? [] : [{ staffId: userId, skillId: skillIds[primarySkill], validFrom: "2025-01-01" }]),
      ...(email === "priya@shiftsync.local" ? [{ staffId: userId, skillId: skillIds.host, validFrom: "2025-01-01" }] : []),
    ]);
    await db.insert(schema.availabilityRules).values(Array.from({ length: 7 }, (_, day) => ({
      staffId: userId,
      weekday: day + 1,
      startLocalTime: "06:00",
      endLocalTime: "23:59",
      timezone,
      validFrom: "2025-01-01",
    })));
  }
  await db.insert(schema.staffLocationCertifications).values({
    staffId: staffIds["maria@shiftsync.local"],
    locationId: locationByName["Pacific Pier"].id,
    validFrom: "2024-01-01",
    validTo: "2024-12-31",
    status: "revoked",
  });

  const { refreshDemoScheduleFixtures } = await import("@/server/demo/refresh");
  const refreshed = await refreshDemoScheduleFixtures();

  console.log(`Seeded 4 locations and 20 staff on the Neon ${branch} branch.`);
  console.log(`Current week: ${refreshed.currentWeek}; evaluator scenario week: ${refreshed.scenarioWeek}.`);
  console.log("Admin:    admin@shiftsync.local");
  console.log("Manager E: manager.east@shiftsync.local");
  console.log("Manager W: manager.west@shiftsync.local");
  console.log("Maria:    maria@shiftsync.local");
  console.log("Jordan:   coverage@shiftsync.local");
  console.log(`Password for all accounts: ${DEMO_PASSWORD}`);

  const { closePool } = await import("@/server/db/pool");
  await closePool();
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
