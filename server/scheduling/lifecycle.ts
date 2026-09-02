import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignmentPeriods,
  assignments,
  auditLogs,
  coverageRequests,
  locations,
  notifications,
  outboxEvents,
  scheduleWeeks,
  shifts,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { canManageLocation } from "./assignment";
import type { ConstraintViolation } from "./constraints";
import { getLocalSnapshot } from "./time";

export type UpdateShiftCommand = {
  shiftId: string;
  startsAt?: Date;
  endsAt?: Date;
  headcount?: number;
  locationId?: string;
  requiredSkillId?: string;
};

const blocker = (code: string, message: string): ConstraintViolation => ({ code, severity: "BLOCK", message, details: {} });
const missing = () => blocker("SCHEDULE_TARGET_NOT_FOUND", "The schedule week or shift no longer exists.");
const unauthorized = () => blocker("MANAGER_LOCATION_UNAUTHORIZED", "You are not authorized to manage this location.");
const cutoffReached = () => blocker("SCHEDULE_CUTOFF_REACHED", "This published schedule is inside the location’s edit cutoff. Use audited emergency coverage for staffing changes.");

export async function publishScheduleWeek(weekId: string, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from schedule_weeks where id = ${weekId} for update`);
    const client = tx as unknown as typeof db;
    const [week] = await client.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, weekId)).limit(1);
    if (!week) return { success: false as const, blockers: [missing()] };
    if (!(await canManageLocation(client, actor, week.locationId))) return { success: false as const, blockers: [unauthorized()] };
    if (week.status === "published") return { success: true as const, weekId: week.id };

    const publishedAt = new Date();
    await tx.update(scheduleWeeks).set({
      status: "published",
      publishedAt,
      publishedBy: actor.session.user.id,
      version: sql`${scheduleWeeks.version} + 1`,
      updatedAt: publishedAt,
    }).where(eq(scheduleWeeks.id, week.id));
    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      action: "SCHEDULE_PUBLISHED",
      entityType: "schedule_week",
      entityId: week.id,
      beforeState: { status: week.status, version: week.version },
      afterState: { status: "published", version: week.version + 1 },
    });
    const eventId = randomUUID();
    await tx.insert(outboxEvents).values({
      id: eventId,
      channel: `private-schedule-${week.id}`,
      event: "schedule.published",
      payload: { eventId, weekId: week.id, locationId: week.locationId, version: week.version + 1 },
    });
    return { success: true as const, weekId: week.id };
  });
}

export async function unpublishScheduleWeek(weekId: string, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from schedule_weeks where id = ${weekId} for update`);
    const client = tx as unknown as typeof db;
    const [record] = await client.select({
      id: scheduleWeeks.id,
      status: scheduleWeeks.status,
      version: scheduleWeeks.version,
      locationId: scheduleWeeks.locationId,
      cutoffMinutes: locations.schedulingCutoffMinutes,
    }).from(scheduleWeeks)
      .innerJoin(locations, eq(scheduleWeeks.locationId, locations.id))
      .where(eq(scheduleWeeks.id, weekId))
      .limit(1);
    if (!record) return { success: false as const, blockers: [missing()] };
    if (!(await canManageLocation(client, actor, record.locationId))) return { success: false as const, blockers: [unauthorized()] };
    if (record.status === "draft") return { success: true as const, weekId: record.id };

    const cutoffBoundary = new Date(Date.now() + record.cutoffMinutes * 60_000);
    const [insideCutoff] = await client.select({ id: shifts.id }).from(shifts).where(and(
      eq(shifts.scheduleWeekId, record.id),
      eq(shifts.status, "active"),
      sql`${shifts.startsAt} < ${cutoffBoundary}`,
    )).limit(1);
    if (insideCutoff) return { success: false as const, blockers: [cutoffReached()] };

    const changedAt = new Date();
    await tx.update(scheduleWeeks).set({
      status: "draft",
      version: sql`${scheduleWeeks.version} + 1`,
      updatedAt: changedAt,
    }).where(eq(scheduleWeeks.id, record.id));
    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      action: "SCHEDULE_UNPUBLISHED",
      entityType: "schedule_week",
      entityId: record.id,
      beforeState: { status: record.status, version: record.version },
      afterState: { status: "draft", version: record.version + 1 },
    });
    const eventId = randomUUID();
    await tx.insert(outboxEvents).values({
      id: eventId,
      channel: `private-schedule-${record.id}`,
      event: "schedule.unpublished",
      payload: { eventId, weekId: record.id, locationId: record.locationId, version: record.version + 1 },
    });
    return { success: true as const, weekId: record.id };
  });
}

export async function updateShift(command: UpdateShiftCommand, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from shifts where id = ${command.shiftId} for update`);
    const client = tx as unknown as typeof db;
    const [current] = await client.select({
      shift: shifts,
      weekStatus: scheduleWeeks.status,
      weekVersion: scheduleWeeks.version,
      weekStartDate: scheduleWeeks.weekStartDate,
      cutoffMinutes: locations.schedulingCutoffMinutes,
    }).from(shifts)
      .innerJoin(scheduleWeeks, eq(shifts.scheduleWeekId, scheduleWeeks.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .where(eq(shifts.id, command.shiftId))
      .limit(1);
    if (!current) return { success: false as const, blockers: [missing()] };
    if (!(await canManageLocation(client, actor, current.shift.locationId))) return { success: false as const, blockers: [unauthorized()] };
    if (command.locationId && command.locationId !== current.shift.locationId && !(await canManageLocation(client, actor, command.locationId))) {
      return { success: false as const, blockers: [unauthorized()] };
    }

    const startsAt = command.startsAt ?? current.shift.startsAt;
    const endsAt = command.endsAt ?? current.shift.endsAt;
    const headcount = command.headcount ?? current.shift.headcount;
    const locationId = command.locationId ?? current.shift.locationId;
    const requiredSkillId = command.requiredSkillId ?? current.shift.requiredSkillId;
    const structuralChange = startsAt.getTime() !== current.shift.startsAt.getTime()
      || endsAt.getTime() !== current.shift.endsAt.getTime()
      || headcount !== current.shift.headcount
      || locationId !== current.shift.locationId
      || requiredSkillId !== current.shift.requiredSkillId;
    if (!structuralChange) return { success: true as const, shiftId: current.shift.id };
    if (endsAt <= startsAt || headcount < 1) return { success: false as const, blockers: [blocker("INVALID_SHIFT_STRUCTURE", "Shift times and headcount are invalid.")] };
    if (current.weekStatus === "published" && current.shift.startsAt.getTime() - Date.now() < current.cutoffMinutes * 60_000) {
      return { success: false as const, blockers: [cutoffReached()] };
    }

    let timezone = current.shift.timezone;
    if (locationId !== current.shift.locationId) {
      const [newLocation] = await client.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, locationId)).limit(1);
      if (!newLocation) return { success: false as const, blockers: [missing()] };
      timezone = newLocation.timezone;
    }
    const localStart = getLocalSnapshot(startsAt, timezone);
    const localEnd = getLocalSnapshot(endsAt, timezone);
    const changedAt = new Date();
    await tx.update(shifts).set({
      startsAt,
      endsAt,
      locationId,
      requiredSkillId,
      headcount,
      timezone,
      localStartDate: localStart.date,
      localStartTime: localStart.time,
      localEndDate: localEnd.date,
      localEndTime: localEnd.time,
      version: sql`${shifts.version} + 1`,
      updatedAt: changedAt,
      updatedBy: actor.session.user.id,
    }).where(eq(shifts.id, current.shift.id));

    if (startsAt.getTime() !== current.shift.startsAt.getTime() || endsAt.getTime() !== current.shift.endsAt.getTime()) {
      const activeAssignments = await client.select({ id: assignments.id, staffId: assignments.staffId }).from(assignments).where(and(
        eq(assignments.shiftId, current.shift.id),
        eq(assignments.status, "assigned"),
      ));
      if (activeAssignments.length) {
        await tx.delete(assignmentPeriods).where(inArray(assignmentPeriods.assignmentId, activeAssignments.map((assignment) => assignment.id)));
        await tx.insert(assignmentPeriods).values(activeAssignments.map((assignment) => ({
          assignmentId: assignment.id,
          staffId: assignment.staffId,
          workPeriod: `[${startsAt.toISOString()},${endsAt.toISOString()})`,
        })));
      }
    }

    const pendingCoverageStatuses = ["open", "pending_target", "accepted_by_target", "claimed"] as const;
    await tx.execute(sql`
      select id from coverage_requests
      where shift_id = ${current.shift.id}
        and status in ('open', 'pending_target', 'accepted_by_target', 'claimed')
      order by id
      for update
    `);
    const pendingCoverage = await client.select({
      id: coverageRequests.id,
      status: coverageRequests.status,
      requesterStaffId: coverageRequests.requesterStaffId,
      targetStaffId: coverageRequests.targetStaffId,
      claimantStaffId: coverageRequests.claimantStaffId,
    }).from(coverageRequests).where(and(
      eq(coverageRequests.shiftId, current.shift.id),
      inArray(coverageRequests.status, pendingCoverageStatuses),
    ));
    if (pendingCoverage.length) {
      await tx.update(coverageRequests).set({
        status: "cancelled",
        cancelledAt: changedAt,
        cancelReason: "Shift details changed",
        version: sql`${coverageRequests.version} + 1`,
      }).where(inArray(coverageRequests.id, pendingCoverage.map((request) => request.id)));

      for (const request of pendingCoverage) {
        const recipients = [...new Set([
          request.requesterStaffId,
          request.targetStaffId,
          request.claimantStaffId,
        ].filter((id): id is string => Boolean(id)))];
        await tx.insert(auditLogs).values({
          actorId: actor.session.user.id,
          action: "COVERAGE_REQUEST_CANCELLED_SHIFT_EDIT",
          entityType: "coverage_request",
          entityId: request.id,
          beforeState: { status: request.status },
          afterState: { status: "cancelled", reason: "Shift details changed" },
        });
        if (recipients.length) {
          await tx.insert(notifications).values(recipients.map((userId) => ({
            userId,
            type: "COVERAGE_REQUEST_CANCELLED",
            title: "Coverage request cancelled",
            message: "The shift details changed, so its pending coverage request was cancelled. Review the updated shift before requesting coverage again.",
            link: `/schedule?week=${current.weekStartDate}&location=${locationId}&shift=${current.shift.id}#shift-${current.shift.id}`,
          })));
          await tx.insert(outboxEvents).values(recipients.map((userId) => {
            const eventId = randomUUID();
            return {
              id: eventId,
              channel: `private-user-${userId}`,
              event: "coverage.cancelled",
              payload: {
                eventId,
                coverageRequestId: request.id,
                shiftId: current.shift.id,
                status: "cancelled",
                reason: "shift-edited",
              },
            };
          }));
        }
      }
    }

    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      action: "SHIFT_UPDATED",
      entityType: "shift",
      entityId: current.shift.id,
      beforeState: {
        startsAt: current.shift.startsAt.toISOString(),
        endsAt: current.shift.endsAt.toISOString(),
        locationId: current.shift.locationId,
        requiredSkillId: current.shift.requiredSkillId,
        headcount: current.shift.headcount,
        version: current.shift.version,
      },
      afterState: {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        locationId,
        requiredSkillId,
        headcount,
        version: current.shift.version + 1,
      },
    });
    await tx.update(scheduleWeeks).set({ version: sql`${scheduleWeeks.version} + 1`, updatedAt: changedAt }).where(eq(scheduleWeeks.id, current.shift.scheduleWeekId));
    return { success: true as const, shiftId: current.shift.id };
  });
}
