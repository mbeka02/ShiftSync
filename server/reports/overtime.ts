import { and, asc, eq, inArray } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  assignments,
  scheduleWeeks,
  shifts,
  staffCompensation,
  staffProfiles,
  userProfiles,
} from "@/server/db/schema";
import { canManageLocation } from "@/server/scheduling/assignment";

const WEEKLY_OVERTIME_THRESHOLD = 40;

type AssignmentEvidence = {
  assignmentId: string;
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
  hours: number;
  cumulativeHours: number;
};

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export async function getOvertimeReport(
  locationId: string,
  scheduleWeekId: string,
  actor: EnrichedSession,
) {
  const empty = {
    staffHours: [] as Array<Record<string, unknown>>,
    staffOvertime: [] as Array<Record<string, unknown>>,
    summary: {
      overtimeThresholdHours: WEEKLY_OVERTIME_THRESHOLD,
      totalScheduledHours: 0,
      totalOvertimeHours: 0,
      projectedOvertimeWages: 0,
      projectedIncrementalPremium: 0,
    },
  };

  if (!(await canManageLocation(db, actor, locationId))) {
    return { success: false as const, code: "FORBIDDEN" as const, ...empty };
  }

  const [week] = await db.select({ id: scheduleWeeks.id, weekStartDate: scheduleWeeks.weekStartDate })
    .from(scheduleWeeks)
    .where(and(eq(scheduleWeeks.id, scheduleWeekId), eq(scheduleWeeks.locationId, locationId)))
    .limit(1);
  if (!week) return { success: false as const, code: "SCHEDULE_WEEK_NOT_FOUND" as const, ...empty };

  const rows = await db.select({
    assignmentId: assignments.id,
    staffId: assignments.staffId,
    firstName: userProfiles.firstName,
    lastName: userProfiles.lastName,
    desiredWeeklyHours: staffProfiles.desiredWeeklyHours,
    shiftId: shifts.id,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
  }).from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .innerJoin(staffProfiles, eq(assignments.staffId, staffProfiles.userId))
    .innerJoin(userProfiles, eq(assignments.staffId, userProfiles.userId))
    .where(and(
      eq(assignments.status, "assigned"),
      eq(shifts.status, "active"),
      eq(shifts.locationId, locationId),
      eq(shifts.scheduleWeekId, scheduleWeekId),
    ))
    .orderBy(asc(assignments.staffId), asc(shifts.startsAt), asc(assignments.id));

  const staffIds = [...new Set(rows.map((row) => row.staffId))];
  const compensationRows = staffIds.length
    ? await db.select().from(staffCompensation).where(inArray(staffCompensation.staffId, staffIds))
    : [];
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.staffId, [...(grouped.get(row.staffId) ?? []), row]);

  const staffHours = [...grouped.entries()].map(([staffId, staffRows]) => {
    let cumulativeHours = 0;
    let thresholdCausingAssignmentId: string | null = null;
    const assignmentEvidence: AssignmentEvidence[] = staffRows.map((row) => {
      const duration = roundHours((row.endsAt.getTime() - row.startsAt.getTime()) / 3_600_000);
      const before = cumulativeHours;
      cumulativeHours = roundHours(cumulativeHours + duration);
      if (thresholdCausingAssignmentId === null && before <= WEEKLY_OVERTIME_THRESHOLD && cumulativeHours > WEEKLY_OVERTIME_THRESHOLD) {
        thresholdCausingAssignmentId = row.assignmentId;
      }
      return { assignmentId: row.assignmentId, shiftId: row.shiftId, startsAt: row.startsAt, endsAt: row.endsAt, hours: duration, cumulativeHours };
    });
    const compensation = compensationRows
      .filter((entry) => entry.staffId === staffId && entry.effectiveFrom <= week.weekStartDate && (entry.effectiveTo === null || entry.effectiveTo >= week.weekStartDate))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const totalHours = cumulativeHours;
    const standardHours = Math.min(WEEKLY_OVERTIME_THRESHOLD, totalHours);
    const overtimeHours = roundHours(Math.max(0, totalHours - WEEKLY_OVERTIME_THRESHOLD));
    const hourlyRate = compensation?.hourlyRate ?? null;
    const overtimeMultiplier = compensation?.overtimeMultiplier ?? 1.5;
    const projectedStandardWages = hourlyRate === null ? null : roundHours(standardHours * hourlyRate);
    const projectedOvertimeWages = hourlyRate === null ? null : roundHours(overtimeHours * hourlyRate * overtimeMultiplier);
    const projectedIncrementalPremium = hourlyRate === null ? null : roundHours(overtimeHours * hourlyRate * (overtimeMultiplier - 1));
    return {
      staffId,
      staffName: `${staffRows[0].firstName} ${staffRows[0].lastName}`,
      desiredWeeklyHours: staffRows[0].desiredWeeklyHours,
      totalHours,
      standardHours,
      overtimeHours,
      thresholdCausingAssignmentId,
      hourlyRate,
      overtimeMultiplier,
      projectedStandardWages,
      projectedOvertimeWages,
      projectedIncrementalPremium,
      projectedTotalWages: projectedStandardWages === null || projectedOvertimeWages === null
        ? null
        : roundHours(projectedStandardWages + projectedOvertimeWages),
      assignments: assignmentEvidence,
    };
  });
  const staffOvertime = staffHours.filter((entry) => entry.overtimeHours > 0);

  return {
    success: true as const,
    staffHours,
    staffOvertime,
    summary: {
      overtimeThresholdHours: WEEKLY_OVERTIME_THRESHOLD,
      totalScheduledHours: roundHours(staffHours.reduce((sum, entry) => sum + entry.totalHours, 0)),
      totalOvertimeHours: roundHours(staffHours.reduce((sum, entry) => sum + entry.overtimeHours, 0)),
      projectedOvertimeWages: roundHours(staffHours.reduce((sum, entry) => sum + (entry.projectedOvertimeWages ?? 0), 0)),
      projectedIncrementalPremium: roundHours(staffHours.reduce((sum, entry) => sum + (entry.projectedIncrementalPremium ?? 0), 0)),
    },
  };
}
