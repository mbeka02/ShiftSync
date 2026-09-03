import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignments,
  locations,
  managerLocations,
  roles,
  scheduleWeeks,
  shifts,
  skills,
  userRoles,
} from "@/server/db/schema";
import { getLocalSnapshot } from "@/server/scheduling/time";

export async function createTestLocation(data: { name: string; timezone: string } = { name: "Test Location", timezone: "UTC" }) {
  const [location] = await db.insert(locations).values({
    name: `${data.name} · ${randomUUID().slice(0, 8)}`,
    timezone: data.timezone,
  }).returning({ id: locations.id });
  return location.id;
}

export async function assignManagerToLocation(userId: string, locationId: string) {
  await db.insert(managerLocations).values({
    managerUserId: userId,
    locationId,
    validFrom: "1970-01-01",
  });
}

export async function createScheduleWeek(
  locationId: string,
  weekStart: string,
  status: "draft" | "published",
) {
  const [week] = await db.insert(scheduleWeeks).values({
    locationId,
    weekStartDate: weekStart,
    status,
    publishedAt: status === "published" ? new Date() : null,
  }).returning({ id: scheduleWeeks.id });
  return week.id;
}

export async function createTestSkill(data: { code: string; name: string } = { code: "test-skill", name: "Test Skill" }) {
  const [skill] = await db.insert(skills).values({
    code: `${data.code}-${randomUUID().slice(0, 8)}`,
    name: data.name,
  }).returning({ id: skills.id });
  return skill.id;
}

export async function createShift(data: {
  scheduleWeekId: string;
  locationId: string;
  requiredSkillId: string;
  startsAt?: Date;
  endsAt?: Date;
  timezone?: string;
  updatedBy?: string;
}) {
  let updatedBy = data.updatedBy;
  if (!updatedBy) {
    const [manager] = await db.select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.code, "manager")))
      .limit(1);
    if (!manager) throw new Error("A manager test user must exist before creating a shift.");
    updatedBy = manager.userId;
  }
  const startsAt = data.startsAt ?? new Date(Date.now() + 60 * 60_000);
  const endsAt = data.endsAt ?? new Date(startsAt.getTime() + 8 * 60 * 60_000);
  const timezone = data.timezone ?? "UTC";
  const start = getLocalSnapshot(startsAt, timezone);
  const end = getLocalSnapshot(endsAt, timezone);
  const [shift] = await db.insert(shifts).values({
    scheduleWeekId: data.scheduleWeekId,
    locationId: data.locationId,
    requiredSkillId: data.requiredSkillId,
    startsAt,
    endsAt,
    timezone,
    updatedBy,
    localStartDate: start.date,
    localStartTime: start.time,
    localEndDate: end.date,
    localEndTime: end.time,
  }).returning({ id: shifts.id });
  return shift.id;
}

export async function createAssignment(shiftId: string, staffId: string, assignedBy: string) {
  const [assignment] = await db.insert(assignments).values({ shiftId, staffId, assignedBy })
    .returning({ id: assignments.id });
  return assignment.id;
}
