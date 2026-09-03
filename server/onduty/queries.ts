import { and, asc, eq, isNull } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  assignments,
  shifts,
  skills,
  timeEntries,
  userProfiles,
} from "@/server/db/schema";
import { canManageLocation } from "@/server/scheduling/assignment";

export async function getOpenTimeEntryForStaff(actor: EnrichedSession) {
  const [entry] = await db.select({
    timeEntryId: timeEntries.id,
    assignmentId: timeEntries.assignmentId,
    locationId: timeEntries.locationId,
    clockInAt: timeEntries.clockInAt,
  }).from(timeEntries).where(and(
    eq(timeEntries.staffId, actor.session.user.id),
    isNull(timeEntries.clockOutAt),
  )).limit(1);
  return entry ?? null;
}

export async function getOnDutyStaff(locationId: string, actor: EnrichedSession) {
  if (!(await canManageLocation(db, actor, locationId))) return [];
  const rows = await db.select({
    timeEntryId: timeEntries.id,
    assignmentId: assignments.id,
    staffId: timeEntries.staffId,
    firstName: userProfiles.firstName,
    lastName: userProfiles.lastName,
    skillName: skills.name,
    shiftStartsAt: shifts.startsAt,
    shiftEndsAt: shifts.endsAt,
    clockInAt: timeEntries.clockInAt,
  }).from(timeEntries)
    .innerJoin(assignments, eq(timeEntries.assignmentId, assignments.id))
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
    .innerJoin(userProfiles, eq(timeEntries.staffId, userProfiles.userId))
    .where(and(
      eq(timeEntries.locationId, locationId),
      isNull(timeEntries.clockOutAt),
      eq(assignments.status, "assigned"),
      eq(shifts.status, "active"),
    ))
    .orderBy(asc(timeEntries.clockInAt));

  return rows.map((row) => ({
    timeEntryId: row.timeEntryId,
    assignmentId: row.assignmentId,
    staffId: row.staffId,
    staffName: `${row.firstName} ${row.lastName}`,
    skillName: row.skillName,
    shiftStartsAt: row.shiftStartsAt,
    shiftEndsAt: row.shiftEndsAt,
    clockInAt: row.clockInAt,
    timing: row.clockInAt.getTime() < row.shiftStartsAt.getTime() - 15 * 60_000
      ? "early" as const
      : row.clockInAt.getTime() > row.shiftStartsAt.getTime() + 15 * 60_000
        ? "late" as const
        : "on_time" as const,
  }));
}
