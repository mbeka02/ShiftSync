import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const DEMO_PASSWORD = "ShiftSyncDemo!2026";
const TIMEZONE = "America/New_York";

function mondayToday() {
  const date = new Date();
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function seed() {
  const { auth } = await import("@/server/auth");
  const { db } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const { getLocalSnapshot } = await import("@/server/scheduling/time");
  const { and, eq } = await import("drizzle-orm");

  async function ensureUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    role: "admin" | "manager" | "staff";
  }) {
    let [record] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, input.email)).limit(1);
    if (!record) {
      const created = await auth.api.signUpEmail({
        body: { email: input.email, password: DEMO_PASSWORD, name: `${input.firstName} ${input.lastName}` },
      });
      record = { id: created.user.id };
    }
    await db.insert(schema.userProfiles).values({ userId: record.id, firstName: input.firstName, lastName: input.lastName })
      .onConflictDoUpdate({ target: schema.userProfiles.userId, set: { firstName: input.firstName, lastName: input.lastName, status: "active", updatedAt: new Date() } });
    const [role] = await db.insert(schema.roles).values({ code: input.role, name: input.role[0].toUpperCase() + input.role.slice(1) })
      .onConflictDoUpdate({ target: schema.roles.code, set: { name: input.role[0].toUpperCase() + input.role.slice(1) } }).returning({ id: schema.roles.id });
    await db.insert(schema.userRoles).values({ userId: record.id, roleId: role.id }).onConflictDoNothing();
    if (input.role === "staff") {
      await db.insert(schema.staffProfiles).values({ userId: record.id, desiredWeeklyHours: 32, primaryTimezone: TIMEZONE, employmentStartDate: "2025-01-01" })
        .onConflictDoUpdate({ target: schema.staffProfiles.userId, set: { desiredWeeklyHours: 32, primaryTimezone: TIMEZONE, employmentEndDate: null, updatedAt: new Date() } });
    }
    return record.id;
  }

  await ensureUser({ email: "admin@shiftsync.local", firstName: "Avery", lastName: "Morgan", role: "admin" });
  const managerId = await ensureUser({ email: "manager@shiftsync.local", firstName: "Alex", lastName: "Rivera", role: "manager" });
  const staffId = await ensureUser({ email: "staff@shiftsync.local", firstName: "Maria", lastName: "Chen", role: "staff" });

  const [location] = await db.insert(schema.locations).values({ name: "Harbor East", timezone: TIMEZONE })
    .onConflictDoUpdate({ target: schema.locations.name, set: { timezone: TIMEZONE, active: true } }).returning({ id: schema.locations.id });
  await db.insert(schema.managerLocations).values({ managerUserId: managerId, locationId: location.id, validFrom: "2025-01-01" }).onConflictDoNothing();

  const weekStart = mondayToday();
  const [week] = await db.insert(schema.scheduleWeeks).values({ locationId: location.id, weekStartDate: weekStart, status: "published", publishedAt: new Date(), publishedBy: managerId })
    .onConflictDoUpdate({ target: [schema.scheduleWeeks.locationId, schema.scheduleWeeks.weekStartDate], set: { status: "published", publishedAt: new Date(), publishedBy: managerId, updatedAt: new Date() } }).returning({ id: schema.scheduleWeeks.id });
  const [skill] = await db.insert(schema.skills).values({ code: "server", name: "Server" })
    .onConflictDoUpdate({ target: schema.skills.code, set: { name: "Server", active: true } }).returning({ id: schema.skills.id });

  const [existingShift] = await db.select({ id: schema.shifts.id }).from(schema.shifts).where(eq(schema.shifts.scheduleWeekId, week.id)).limit(1);
  if (!existingShift) {
    for (const offset of [0, 2, 4]) {
      const start = new Date(`${weekStart}T21:00:00Z`);
      start.setUTCDate(start.getUTCDate() + offset);
      const end = new Date(start);
      end.setUTCHours(end.getUTCHours() + 6);
      const localStart = getLocalSnapshot(start, TIMEZONE);
      const localEnd = getLocalSnapshot(end, TIMEZONE);
      const [shift] = await db.insert(schema.shifts).values({
        scheduleWeekId: week.id,
        locationId: location.id,
        requiredSkillId: skill.id,
        startsAt: start,
        endsAt: end,
        timezone: TIMEZONE,
        localStartDate: localStart.date,
        localStartTime: localStart.time,
        localEndDate: localEnd.date,
        localEndTime: localEnd.time,
        updatedBy: managerId,
      }).returning({ id: schema.shifts.id });
      await db.insert(schema.assignments).values({ shiftId: shift.id, staffId, assignedBy: managerId }).onConflictDoNothing();
    }
  } else {
    const existing = await db.select({ id: schema.shifts.id }).from(schema.shifts).where(and(eq(schema.shifts.scheduleWeekId, week.id), eq(schema.shifts.status, "active")));
    for (const shift of existing) {
      await db.insert(schema.assignments).values({ shiftId: shift.id, staffId, assignedBy: managerId }).onConflictDoNothing();
    }
  }

  console.log(`Seeded Harbor East for week ${weekStart}.`);
  console.log("Admin:   admin@shiftsync.local");
  console.log("Manager: manager@shiftsync.local");
  console.log("Staff:   staff@shiftsync.local");
  console.log(`Password for all accounts: ${DEMO_PASSWORD}`);

  const { closePool } = await import("@/server/db/pool");
  await closePool();
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

