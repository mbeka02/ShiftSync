import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignments,
  locations,
  managerLocations,
  scheduleWeeks,
  shifts,
  skills,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";

const hasRole = (actor: EnrichedSession, role: string) =>
  actor.roles.some((entry) => entry.code === role);

export async function getScheduleForLocation(
  locationId: string,
  weekStart: string,
  actor: EnrichedSession,
) {
  let authorized = hasRole(actor, "admin");
  if (!authorized && hasRole(actor, "manager")) {
    const today = new Date().toISOString().slice(0, 10);
    const [scope] = await db.select({ locationId: managerLocations.locationId })
      .from(managerLocations)
      .where(and(
        eq(managerLocations.managerUserId, actor.session.user.id),
        eq(managerLocations.locationId, locationId),
        lte(managerLocations.validFrom, today),
        or(isNull(managerLocations.validTo), gte(managerLocations.validTo, today)),
      ))
      .limit(1);
    authorized = Boolean(scope);
  }
  if (!authorized) return { success: false as const, code: "FORBIDDEN" as const };

  const [location] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  const [week] = await db.select().from(scheduleWeeks).where(and(
    eq(scheduleWeeks.locationId, locationId),
    eq(scheduleWeeks.weekStartDate, weekStart),
  )).limit(1);
  const weekShifts = week
    ? await db.select({
        shiftId: shifts.id,
        startsAt: shifts.startsAt,
        endsAt: shifts.endsAt,
        status: shifts.status,
        headcount: shifts.headcount,
        skillName: skills.name,
      }).from(shifts)
        .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
        .where(eq(shifts.scheduleWeekId, week.id))
        .orderBy(asc(shifts.startsAt))
    : [];

  return {
    success: true as const,
    data: { location: location ?? null, week: week ?? null, shifts: weekShifts },
  };
}

export async function getMySchedule(weekStart: string, actor: EnrichedSession) {
  if (!hasRole(actor, "staff")) {
    throw new Error("Staff schedule access requires the staff role.");
  }
  const rows = await db.select({
    shiftId: shifts.id,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    localStartDate: shifts.localStartDate,
    localStartTime: shifts.localStartTime,
    localEndDate: shifts.localEndDate,
    localEndTime: shifts.localEndTime,
    locationName: locations.name,
    locationTimezone: locations.timezone,
    skillName: skills.name,
  }).from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .innerJoin(scheduleWeeks, eq(shifts.scheduleWeekId, scheduleWeeks.id))
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
    .where(and(
      eq(assignments.staffId, actor.session.user.id),
      eq(assignments.status, "assigned"),
      eq(shifts.status, "active"),
      eq(scheduleWeeks.status, "published"),
      eq(scheduleWeeks.weekStartDate, weekStart),
    ))
    .orderBy(asc(shifts.startsAt));

  return { weekStart, shifts: rows };
}

export async function getAccessibleLocations(actor: EnrichedSession) {
  if (hasRole(actor, "admin")) {
    return db.select().from(locations).where(eq(locations.active, true)).orderBy(asc(locations.name));
  }
  if (hasRole(actor, "manager")) {
    const today = new Date().toISOString().slice(0, 10);
    return db.select({
      id: locations.id,
      name: locations.name,
      timezone: locations.timezone,
      active: locations.active,
      schedulingCutoffMinutes: locations.schedulingCutoffMinutes,
      createdAt: locations.createdAt,
    }).from(managerLocations)
      .innerJoin(locations, eq(managerLocations.locationId, locations.id))
      .where(and(
        eq(managerLocations.managerUserId, actor.session.user.id),
        eq(locations.active, true),
        lte(managerLocations.validFrom, today),
        or(isNull(managerLocations.validTo), gte(managerLocations.validTo, today)),
      ))
      .orderBy(asc(locations.name));
  }
  return [];
}
