import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, like, lte, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  assignmentPeriods,
  assignments,
  auditLogs,
  coverageRequests,
  locations,
  notifications,
  scheduleWeeks,
  shifts,
  skills,
  timeEntries,
  user,
} from "@/server/db/schema";
import { getLocalSnapshot, localDateTimeToInstant } from "@/server/scheduling/time";

const DEMO_LOCATION_NAMES = ["Harbor East", "Midtown Table", "Pacific Pier", "Sunset Kitchen"] as const;
const EAST_STAFF_EMAILS = [
  "maria@shiftsync.local",
  "coverage@shiftsync.local",
  "priya@shiftsync.local",
  "devon@shiftsync.local",
  "casey@shiftsync.local",
  "luis@shiftsync.local",
  "nina@shiftsync.local",
  "omar@shiftsync.local",
  "zoe@shiftsync.local",
  "eli@shiftsync.local",
] as const;
const WEST_STAFF_EMAILS = [
  "sofia@shiftsync.local",
  "mateo@shiftsync.local",
  "aisha@shiftsync.local",
  "noah@shiftsync.local",
  "grace@shiftsync.local",
  "leo@shiftsync.local",
  "maya@shiftsync.local",
  "ethan@shiftsync.local",
  "chloe@shiftsync.local",
  "ben@shiftsync.local",
] as const;
const REQUIRED_USER_EMAILS = [
  "admin@shiftsync.local",
  "manager.east@shiftsync.local",
  "manager.west@shiftsync.local",
  ...EAST_STAFF_EMAILS,
  ...WEST_STAFF_EMAILS,
] as const;
const REQUIRED_SKILL_CODES = ["server", "bartender", "line-cook", "host"] as const;
const PENDING_COVERAGE_STATUSES = ["open", "pending_target", "accepted_by_target", "claimed"] as const;

export type DemoScheduleWindow = {
  currentWeek: string;
  scenarioWeek: string;
};

export type DemoRefreshResult = DemoScheduleWindow & {
  locations: number;
  shifts: number;
  assignments: number;
  coverageRequests: number;
  onDutyEntries: number;
};

type DemoRefreshAuthorization = {
  authorization: string | null;
  branch: string | undefined;
  enabled: string | undefined;
  cronSecret: string | undefined;
};

type WeekKey = "current" | "scenario";
type ShiftFixture = {
  locationName: typeof DEMO_LOCATION_NAMES[number];
  week: WeekKey;
  day: number;
  startHour: number;
  duration: number;
  skill?: typeof REQUIRED_SKILL_CODES[number];
  premium?: boolean;
  headcount?: number;
  assignees?: readonly string[];
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getDemoScheduleWindow(now: Date): DemoScheduleWindow {
  const monday = new Date(now);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  return {
    currentWeek: monday.toISOString().slice(0, 10),
    scenarioWeek: nextMonday.toISOString().slice(0, 10),
  };
}

export function isDemoRefreshRequestAuthorized(input: DemoRefreshAuthorization): boolean {
  return input.branch === "production"
    && input.enabled === "true"
    && Boolean(input.cronSecret)
    && input.authorization === `Bearer ${input.cronSecret}`;
}

function requireFixture<T>(record: Record<string, T>, key: string, kind: string): T {
  const value = record[key];
  if (!value) throw new Error(`Demo refresh requires ${kind} '${key}'. Run the full guarded seed first.`);
  return value;
}

export async function refreshDemoScheduleFixtures(
  { now = new Date() }: { now?: Date } = {},
): Promise<DemoRefreshResult> {
  if (Number.isNaN(now.getTime())) throw new Error("Demo refresh requires a valid invocation date.");

  const { currentWeek, scenarioWeek } = getDemoScheduleWindow(now);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('shiftsync-demo-schedule-refresh'))`);

    const [userRows, locationRows, skillRows] = await Promise.all([
      tx.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, [...REQUIRED_USER_EMAILS])),
      tx.select({ id: locations.id, name: locations.name, timezone: locations.timezone })
        .from(locations)
        .where(inArray(locations.name, [...DEMO_LOCATION_NAMES])),
      tx.select({ id: skills.id, code: skills.code }).from(skills).where(inArray(skills.code, [...REQUIRED_SKILL_CODES])),
    ]);

    const userIds = Object.fromEntries(userRows.map((row) => [row.email, row.id])) as Record<string, string>;
    const locationsByName = Object.fromEntries(locationRows.map((row) => [row.name, row])) as Record<string, typeof locationRows[number]>;
    const skillIds = Object.fromEntries(skillRows.map((row) => [row.code, row.id])) as Record<string, string>;

    for (const email of REQUIRED_USER_EMAILS) requireFixture(userIds, email, "user");
    for (const name of DEMO_LOCATION_NAMES) requireFixture(locationsByName, name, "location");
    for (const code of REQUIRED_SKILL_CODES) requireFixture(skillIds, code, "skill");

    const eastManagerId = requireFixture(userIds, "manager.east@shiftsync.local", "user");
    const westManagerId = requireFixture(userIds, "manager.west@shiftsync.local", "user");
    const adminId = requireFixture(userIds, "admin@shiftsync.local", "user");
    const locationIds = DEMO_LOCATION_NAMES.map((name) => requireFixture(locationsByName, name, "location").id);

    await tx.update(timeEntries).set({ clockOutAt: now }).where(and(
      inArray(timeEntries.locationId, locationIds),
      isNull(timeEntries.clockOutAt),
    ));
    await tx.update(coverageRequests).set({
      status: "expired",
      cancelledAt: now,
      cancelReason: "Demo scenario window elapsed",
    }).where(and(
      inArray(coverageRequests.status, [...PENDING_COVERAGE_STATUSES]),
      inArray(coverageRequests.shiftId, tx.select({ id: shifts.id }).from(shifts).where(and(
        inArray(shifts.locationId, locationIds),
        lte(shifts.endsAt, now),
      ))),
    ));
    await tx.delete(notifications).where(or(
      and(
        eq(notifications.userId, eastManagerId),
        eq(notifications.title, "Swap ready for approval"),
      ),
      and(
        eq(notifications.userId, requireFixture(userIds, "maria@shiftsync.local", "user")),
        eq(notifications.title, "Schedule published"),
      ),
      like(notifications.link, `%week=${currentWeek}%`),
      like(notifications.link, `%week=${scenarioWeek}%`),
    ));
    await tx.delete(scheduleWeeks).where(and(
      inArray(scheduleWeeks.locationId, locationIds),
      inArray(scheduleWeeks.weekStartDate, [currentWeek, scenarioWeek]),
    ));

    const weekIds: Record<string, Record<WeekKey, string>> = {};
    const weekValues = DEMO_LOCATION_NAMES.flatMap((name) => {
      const location = requireFixture(locationsByName, name, "location");
      const managerId = name === "Harbor East" || name === "Midtown Table" ? eastManagerId : westManagerId;
      const currentId = randomUUID();
      const scenarioId = randomUUID();
      weekIds[name] = { current: currentId, scenario: scenarioId };
      return [
        { id: currentId, locationId: location.id, weekStartDate: currentWeek, status: "published" as const, publishedAt: now, publishedBy: managerId, updatedAt: now },
        { id: scenarioId, locationId: location.id, weekStartDate: scenarioWeek, status: "published" as const, publishedAt: now, publishedBy: managerId, updatedAt: now },
      ];
    });
    await tx.insert(scheduleWeeks).values(weekValues);

    const fixtures: ShiftFixture[] = [];
    for (const week of ["current", "scenario"] as const) {
      for (let day = 0; day < 5; day += 1) {
        fixtures.push(
          { locationName: "Harbor East", week, day, startHour: 9, duration: 7, assignees: ["maria@shiftsync.local"] },
          { locationName: "Harbor East", week, day, startHour: 8, duration: 8, assignees: ["coverage@shiftsync.local"] },
          { locationName: "Harbor East", week, day, startHour: 10, duration: day === 4 ? 12 : 10, skill: "line-cook", assignees: ["devon@shiftsync.local"] },
        );
      }
      for (let day = 0; day < 6; day += 1) {
        fixtures.push({ locationName: "Harbor East", week, day, startHour: 17, duration: 5, assignees: ["casey@shiftsync.local"], premium: day >= 4 });
      }
      fixtures.push({ locationName: "Harbor East", week, day: 6, startHour: 17, duration: 5, premium: true });

      for (let day = 0; day < 7; day += 1) {
        const midtownAssignee = day === 2 ? EAST_STAFF_EMAILS[9] : EAST_STAFF_EMAILS[5 + (day % 5)];
        fixtures.push(
          { locationName: "Midtown Table", week, day, startHour: 16, duration: 7, premium: day >= 4, assignees: [midtownAssignee] },
          { locationName: "Pacific Pier", week, day, startHour: 9, duration: 8, premium: day >= 5, assignees: [WEST_STAFF_EMAILS[day % 10]] },
          { locationName: "Sunset Kitchen", week, day, startHour: 15, duration: 7, skill: day % 2 ? "bartender" : "server", premium: day >= 4, assignees: [WEST_STAFF_EMAILS[(day + 3) % 10]] },
        );
      }
    }

    const easternSoon = getLocalSnapshot(new Date(now.getTime() + 2 * 60 * 60_000), "America/New_York");
    const easternLater = getLocalSnapshot(new Date(now.getTime() + 6 * 60 * 60_000), "America/New_York");
    const currentWeekDate = new Date(`${currentWeek}T12:00:00Z`).getTime();
    const dayOffset = (date: string) => Math.round((new Date(`${date}T12:00:00Z`).getTime() - currentWeekDate) / (24 * 60 * 60_000));
    fixtures.push(
      { locationName: "Harbor East", week: "current", day: dayOffset(easternSoon.date), startHour: Number(easternSoon.time.slice(0, 2)), duration: 3, skill: "bartender" },
      { locationName: "Harbor East", week: "current", day: dayOffset(easternLater.date), startHour: Number(easternLater.time.slice(0, 2)), duration: 2, skill: "host" },
      { locationName: "Harbor East", week: "scenario", day: 5, startHour: 8, duration: 8, premium: true },
      { locationName: "Harbor East", week: "scenario", day: 2, startHour: 12, duration: 3, skill: "host" },
    );

    const shiftRecords = fixtures.map((fixture) => {
      const location = requireFixture(locationsByName, fixture.locationName, "location");
      const weekStart = fixture.week === "current" ? currentWeek : scenarioWeek;
      const localDate = addDays(weekStart, fixture.day);
      const startsAt = localDateTimeToInstant(`${localDate}T${String(fixture.startHour).padStart(2, "0")}:00`, location.timezone);
      const endsAt = new Date(startsAt.getTime() + fixture.duration * 60 * 60_000);
      const localStart = getLocalSnapshot(startsAt, location.timezone);
      const localEnd = getLocalSnapshot(endsAt, location.timezone);
      const managerId = fixture.locationName === "Harbor East" || fixture.locationName === "Midtown Table" ? eastManagerId : westManagerId;
      return {
        fixture,
        value: {
          id: randomUUID(),
          scheduleWeekId: weekIds[fixture.locationName][fixture.week],
          locationId: location.id,
          requiredSkillId: requireFixture(skillIds, fixture.skill ?? "server", "skill"),
          startsAt,
          endsAt,
          timezone: location.timezone,
          localStartDate: localStart.date,
          localStartTime: localStart.time,
          localEndDate: localEnd.date,
          localEndTime: localEnd.time,
          headcount: fixture.headcount ?? 1,
          premium: fixture.premium ?? false,
          updatedAt: now,
          updatedBy: managerId,
        },
      };
    });
    await tx.insert(shifts).values(shiftRecords.map((record) => record.value));

    const assignmentRecords = shiftRecords.flatMap((record) => (record.fixture.assignees ?? []).map((email) => ({
      fixture: record.fixture,
      shift: record.value,
      value: {
        id: randomUUID(),
        shiftId: record.value.id,
        staffId: requireFixture(userIds, email, "user"),
        assignedAt: now,
        assignedBy: record.value.updatedBy,
        createdAt: now,
        updatedAt: now,
      },
    })));
    await tx.insert(assignments).values(assignmentRecords.map((record) => record.value));
    await tx.insert(assignmentPeriods).values(assignmentRecords.map((record) => ({
      assignmentId: record.value.id,
      staffId: record.value.staffId,
      workPeriod: `[${record.shift.startsAt.toISOString()},${record.shift.endsAt.toISOString()})`,
    })));

    const mariaFriday = shiftRecords.find(({ fixture }) => fixture.locationName === "Harbor East"
      && fixture.week === "scenario" && fixture.day === 4 && fixture.startHour === 9);
    const caseySaturday = shiftRecords.find(({ fixture }) => fixture.locationName === "Harbor East"
      && fixture.week === "scenario" && fixture.day === 5 && fixture.startHour === 17);
    if (!mariaFriday || !caseySaturday) throw new Error("Demo coverage fixtures could not be resolved.");

    await tx.insert(coverageRequests).values([
      {
        shiftId: mariaFriday.value.id,
        requesterStaffId: requireFixture(userIds, "maria@shiftsync.local", "user"),
        type: "drop",
        status: "open",
        reason: "Family commitment",
        createdAt: now,
        expiresAt: new Date(mariaFriday.value.startsAt.getTime() - 24 * 60 * 60_000),
      },
      {
        shiftId: caseySaturday.value.id,
        requesterStaffId: requireFixture(userIds, "casey@shiftsync.local", "user"),
        targetStaffId: requireFixture(userIds, "priya@shiftsync.local", "user"),
        type: "swap",
        status: "accepted_by_target",
        reason: "Training appointment",
        createdAt: now,
        acceptedAt: now,
      },
    ]);

    const currentLocalDates = Object.fromEntries(DEMO_LOCATION_NAMES.map((name) => {
      const location = requireFixture(locationsByName, name, "location");
      return [name, getLocalSnapshot(now, location.timezone).date];
    })) as Record<string, string>;
    const onDutyAssignment = assignmentRecords.find((record) => record.fixture.week === "current"
      && record.shift.localStartDate === currentLocalDates[record.fixture.locationName]);
    if (onDutyAssignment) {
      await tx.insert(timeEntries).values({
        assignmentId: onDutyAssignment.value.id,
        staffId: onDutyAssignment.value.staffId,
        locationId: onDutyAssignment.shift.locationId,
        clockInAt: new Date(now.getTime() - 75 * 60_000),
        createdAt: now,
      });
    }

    await tx.insert(notifications).values([
      {
        userId: eastManagerId,
        type: "COVERAGE_APPROVAL_REQUIRED",
        title: "Swap ready for approval",
        message: "Casey and Priya agreed to a swap. Review eligibility before approval.",
        link: `/schedule?week=${scenarioWeek}&location=${requireFixture(locationsByName, "Harbor East", "location").id}#coverage-desk`,
        createdAt: now,
      },
      {
        userId: requireFixture(userIds, "maria@shiftsync.local", "user"),
        type: "SCHEDULE_PUBLISHED",
        title: "Schedule published",
        message: `Your schedule for the week of ${scenarioWeek} is ready.`,
        link: `/schedule?week=${scenarioWeek}#schedule-content`,
        createdAt: now,
      },
    ]);
    await tx.insert(auditLogs).values({
      actorId: adminId,
      action: "DEMO_SCHEDULE_REFRESHED",
      entityType: "system",
      entityId: currentWeek,
      reason: "Rolling public evaluator dataset",
      afterState: { currentWeek, scenarioWeek, locations: locationRows.length, shifts: shiftRecords.length, assignments: assignmentRecords.length },
      createdAt: now,
    });

    return {
      currentWeek,
      scenarioWeek,
      locations: locationRows.length,
      shifts: shiftRecords.length,
      assignments: assignmentRecords.length,
      coverageRequests: 2,
      onDutyEntries: onDutyAssignment ? 1 : 0,
    };
  });
}
