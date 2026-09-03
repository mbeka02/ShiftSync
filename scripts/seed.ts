import { config } from "dotenv";

const seedEnvFile = process.env.SEED_ENV_FILE ?? ".env.local";
if (seedEnvFile !== ".env.local") config({ path: ".env.local", quiet: true });
config({ path: seedEnvFile, override: true, quiet: true });

const DEMO_PASSWORD = "ShiftSyncDemo!2026";

function monday(date = new Date(), offsetWeeks = 0) {
  const result = new Date(date);
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1 + offsetWeeks * 7);
  return result.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

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
  const { localDateTimeToInstant, getLocalSnapshot } = await import("@/server/scheduling/time");
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

  const adminId = await createUser({ email: "admin@shiftsync.local", firstName: "Avery", lastName: "Morgan", role: "admin" });
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
  const eastStaff = staffInputs.slice(0, 10);
  const westStaff = staffInputs.slice(10);
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

  const currentWeek = monday();
  const scenarioWeek = monday(new Date(), 1);
  type WeekMap = Record<string, { current: string; scenario: string }>;
  const weeks: WeekMap = {};
  for (const location of locationRows) {
    const east = location.name === "Harbor East" || location.name === "Midtown Table";
    const inserted = await db.insert(schema.scheduleWeeks).values([
      { locationId: location.id, weekStartDate: currentWeek, status: "published", publishedAt: new Date(), publishedBy: east ? eastManagerId : westManagerId },
      { locationId: location.id, weekStartDate: scenarioWeek, status: "published", publishedAt: new Date(), publishedBy: east ? eastManagerId : westManagerId },
    ]).returning({ id: schema.scheduleWeeks.id, weekStartDate: schema.scheduleWeeks.weekStartDate });
    weeks[location.name] = { current: inserted.find((week) => week.weekStartDate === currentWeek)!.id, scenario: inserted.find((week) => week.weekStartDate === scenarioWeek)!.id };
  }

  async function createShift(input: { locationName: string; week: "current" | "scenario"; day: number; startHour: number; duration: number; skill?: string; premium?: boolean; headcount?: number; assignees?: string[] }) {
    const location = locationByName[input.locationName];
    const weekStart = input.week === "current" ? currentWeek : scenarioWeek;
    const localDate = addDays(weekStart, input.day);
    const startsAt = localDateTimeToInstant(`${localDate}T${String(input.startHour).padStart(2, "0")}:00`, location.timezone);
    const endsAt = new Date(startsAt.getTime() + input.duration * 60 * 60_000);
    const localStart = getLocalSnapshot(startsAt, location.timezone);
    const localEnd = getLocalSnapshot(endsAt, location.timezone);
    const [shift] = await db.insert(schema.shifts).values({
      scheduleWeekId: weeks[input.locationName][input.week],
      locationId: location.id,
      requiredSkillId: skillIds[input.skill ?? "server"],
      startsAt,
      endsAt,
      timezone: location.timezone,
      localStartDate: localStart.date,
      localStartTime: localStart.time,
      localEndDate: localEnd.date,
      localEndTime: localEnd.time,
      headcount: input.headcount ?? 1,
      premium: input.premium ?? false,
      updatedBy: input.locationName === "Harbor East" || input.locationName === "Midtown Table" ? eastManagerId : westManagerId,
    }).returning({ id: schema.shifts.id });
    for (const email of input.assignees ?? []) {
      const staffId = staffIds[email];
      const [assignment] = await db.insert(schema.assignments).values({ shiftId: shift.id, staffId, assignedBy: input.locationName === "Harbor East" || input.locationName === "Midtown Table" ? eastManagerId : westManagerId }).returning({ id: schema.assignments.id });
      await db.insert(schema.assignmentPeriods).values({ assignmentId: assignment.id, staffId, workPeriod: `[${startsAt.toISOString()},${endsAt.toISOString()})` });
    }
    return shift.id;
  }

  for (const week of ["current", "scenario"] as const) {
    for (let day = 0; day < 5; day++) {
      await createShift({ locationName: "Harbor East", week, day, startHour: 9, duration: 7, assignees: ["maria@shiftsync.local"] });
      await createShift({ locationName: "Harbor East", week, day, startHour: 8, duration: 8, assignees: ["coverage@shiftsync.local"] });
      await createShift({ locationName: "Harbor East", week, day, startHour: 10, duration: day === 4 ? 12 : 10, skill: "line-cook", assignees: ["devon@shiftsync.local"] });
    }
    for (let day = 0; day < 6; day++) await createShift({ locationName: "Harbor East", week, day, startHour: 17, duration: 5, assignees: ["casey@shiftsync.local"], premium: day >= 4 });
    await createShift({ locationName: "Harbor East", week, day: 6, startHour: 17, duration: 5, premium: true });
    for (let day = 0; day < 7; day++) {
      // Keep Omar free on Wednesday so the dedicated Host opening below has a
      // fully eligible candidate for the simultaneous-assignment race.
      const midtownAssignee = day === 2 ? eastStaff[9][0] : eastStaff[5 + (day % 5)][0];
      await createShift({ locationName: "Midtown Table", week, day, startHour: 16, duration: 7, premium: day >= 4, assignees: [midtownAssignee] });
      await createShift({ locationName: "Pacific Pier", week, day, startHour: 9, duration: 8, premium: day >= 5, assignees: [westStaff[day % 10][0]] });
      await createShift({ locationName: "Sunset Kitchen", week, day, startHour: 15, duration: 7, skill: day % 2 ? "bartender" : "server", premium: day >= 4, assignees: [westStaff[(day + 3) % 10][0]] });
    }
  }

  const easternSoon = getLocalSnapshot(new Date(Date.now() + 2 * 60 * 60_000), "America/New_York");
  const easternLater = getLocalSnapshot(new Date(Date.now() + 6 * 60 * 60_000), "America/New_York");
  const currentWeekDate = new Date(`${currentWeek}T12:00:00Z`).getTime();
  const localDayOffset = (date: string) => Math.round((new Date(`${date}T12:00:00Z`).getTime() - currentWeekDate) / (24 * 60 * 60_000));
  await createShift({ locationName: "Harbor East", week: "current", day: localDayOffset(easternSoon.date), startHour: Number(easternSoon.time.slice(0, 2)), duration: 3, skill: "bartender" });
  await createShift({ locationName: "Harbor East", week: "current", day: localDayOffset(easternLater.date), startHour: Number(easternLater.time.slice(0, 2)), duration: 2, skill: "host" });
  await createShift({ locationName: "Harbor East", week: "scenario", day: 5, startHour: 8, duration: 8, premium: true });
  // Dedicated concurrency fixture: Omar is qualified, available, and unassigned
  // that day, so both managers can reach the transactional commit boundary.
  await createShift({ locationName: "Harbor East", week: "scenario", day: 2, startHour: 12, duration: 3, skill: "host" });

  const scenarioShifts = await db.select({ id: schema.shifts.id, localStartDate: schema.shifts.localStartDate, localStartTime: schema.shifts.localStartTime, startsAt: schema.shifts.startsAt }).from(schema.shifts).where(eq(schema.shifts.scheduleWeekId, weeks["Harbor East"].scenario));
  const mariaFridayShift = scenarioShifts.find((shift) => shift.localStartDate === addDays(scenarioWeek, 4) && shift.localStartTime.startsWith("09:00"))!;
  const jordanSaturdayShift = scenarioShifts.find((shift) => shift.localStartDate === addDays(scenarioWeek, 5))!.id;
  await db.insert(schema.coverageRequests).values([
    { shiftId: mariaFridayShift.id, requesterStaffId: staffIds["maria@shiftsync.local"], type: "drop", status: "open", reason: "Family commitment", expiresAt: new Date(mariaFridayShift.startsAt.getTime() - 24 * 60 * 60_000) },
    { shiftId: jordanSaturdayShift, requesterStaffId: staffIds["casey@shiftsync.local"], targetStaffId: staffIds["priya@shiftsync.local"], type: "swap", status: "accepted_by_target", reason: "Training appointment", acceptedAt: new Date() },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const [todayAssignment] = await db.select({ assignmentId: schema.assignments.id, staffId: schema.assignments.staffId, locationId: schema.shifts.locationId })
    .from(schema.assignments).innerJoin(schema.shifts, eq(schema.assignments.shiftId, schema.shifts.id))
    .where(and(eq(schema.shifts.scheduleWeekId, weeks["Harbor East"].current), eq(schema.shifts.localStartDate, today))).limit(1);
  if (todayAssignment) await db.insert(schema.timeEntries).values({ ...todayAssignment, clockInAt: new Date(Date.now() - 75 * 60_000) });

  await db.insert(schema.notifications).values([
    { userId: eastManagerId, type: "COVERAGE_APPROVAL_REQUIRED", title: "Swap ready for approval", message: "Casey and Priya agreed to a swap. Review eligibility before approval.", link: `/schedule?week=${scenarioWeek}&location=${locationByName["Harbor East"].id}#coverage-desk` },
    { userId: staffIds["maria@shiftsync.local"], type: "SCHEDULE_PUBLISHED", title: "Schedule published", message: `Your schedule for the week of ${scenarioWeek} is ready.`, link: `/schedule?week=${scenarioWeek}#schedule-content` },
  ]);
  await db.insert(schema.auditLogs).values({ actorId: adminId, action: "DEMO_DATA_SEEDED", entityType: "system", entityId: "development", reason: "Deterministic evaluator dataset", afterState: { currentWeek, scenarioWeek, locations: locationRows.length, staff: staffInputs.length } });

  console.log(`Seeded 4 locations and 20 staff on the Neon ${branch} branch.`);
  console.log(`Current week: ${currentWeek}; evaluator scenario week: ${scenarioWeek}.`);
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
