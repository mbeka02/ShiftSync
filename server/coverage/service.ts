import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignmentPeriods,
  assignments,
  auditLogs,
  coverageRequests,
  notifications,
  outboxEvents,
  scheduleWeeks,
  shifts,
  staffProfiles,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { canManageLocation, loadEvaluationInput } from "@/server/scheduling/assignment";
import type { ConstraintViolation } from "@/server/scheduling/constraints";

type SwapCommand = { shiftId: string; targetStaffId: string; reason?: string };
type DropCommand = { shiftId: string; reason?: string };
type CoverageType = "swap" | "drop";
type PendingStatus = "open" | "pending_target" | "accepted_by_target" | "claimed";

const pendingStatuses: PendingStatus[] = ["open", "pending_target", "accepted_by_target", "claimed"];

const blocked = (code: string, message: string): ConstraintViolation => ({
  code,
  severity: "BLOCK",
  message,
  details: {},
});

const failed = (code: string, message: string) => ({ success: false as const, blockers: [blocked(code, message)] });
const isStaff = (actor: EnrichedSession) => actor.roles.some((role) => role.code === "staff");

async function lockStaff(client: typeof db, staffIds: string[]) {
  for (const staffId of [...new Set(staffIds)].sort()) {
    await client.execute(sql`select user_id from staff_profiles where user_id = ${staffId} for update`);
  }
}

async function lockRequest(client: typeof db, requestId: string) {
  const [locator] = await client.select({ shiftId: coverageRequests.shiftId })
    .from(coverageRequests)
    .where(eq(coverageRequests.id, requestId))
    .limit(1);
  if (!locator) return null;

  await client.execute(sql`select id from shifts where id = ${locator.shiftId} for update`);
  await client.execute(sql`select id from coverage_requests where id = ${requestId} for update`);
  const [request] = await client.select().from(coverageRequests).where(eq(coverageRequests.id, requestId)).limit(1);
  return request ?? null;
}

async function appendAuditAndEvent(client: typeof db, values: {
  actorId: string;
  action: string;
  requestId: string;
  shiftId: string;
  beforeStatus?: string;
  afterStatus: string;
  recipients?: string[];
}) {
  await client.insert(auditLogs).values({
    actorId: values.actorId,
    action: values.action,
    entityType: "coverage_request",
    entityId: values.requestId,
    beforeState: values.beforeStatus ? { status: values.beforeStatus } : null,
    afterState: { status: values.afterStatus, shiftId: values.shiftId },
  });
  const eventId = randomUUID();
  await client.insert(outboxEvents).values({
    id: eventId,
    channel: `private-shift-${values.shiftId}`,
    event: `coverage.${values.afterStatus}`,
    payload: {
      eventId,
      coverageRequestId: values.requestId,
      shiftId: values.shiftId,
      status: values.afterStatus,
      recipients: values.recipients ?? [],
    },
  });
}

async function createRequest(command: SwapCommand | DropCommand, actor: EnrichedSession, type: CoverageType) {
  if (!isStaff(actor)) return failed("STAFF_ROLE_REQUIRED", "Only staff members can request coverage for their assigned shifts.");
  const requesterStaffId = actor.session.user.id;
  const targetStaffId = type === "swap" ? (command as SwapCommand).targetStaffId : null;
  if (targetStaffId === requesterStaffId) return failed("INVALID_COVERAGE_TARGET", "Choose another staff member for this swap.");

  return db.transaction(async (tx) => {
    const client = tx as unknown as typeof db;
    await lockStaff(client, [requesterStaffId]);
    const [ownedShift] = await client.select({
      id: shifts.id,
      startsAt: shifts.startsAt,
      weekStartDate: scheduleWeeks.weekStartDate,
      locationId: shifts.locationId,
    }).from(shifts)
      .innerJoin(scheduleWeeks, eq(shifts.scheduleWeekId, scheduleWeeks.id))
      .innerJoin(assignments, eq(assignments.shiftId, shifts.id))
      .where(and(
        eq(shifts.id, command.shiftId),
        eq(shifts.status, "active"),
        eq(scheduleWeeks.status, "published"),
        eq(assignments.staffId, requesterStaffId),
        eq(assignments.status, "assigned"),
      ))
      .limit(1);
    if (!ownedShift) return failed("COVERAGE_SHIFT_NOT_ASSIGNED", "This published shift is not currently assigned to you.");
    if (ownedShift.startsAt <= new Date()) return failed("COVERAGE_WINDOW_CLOSED", "Coverage requests cannot be created after a shift has started.");

    if (targetStaffId) {
      const [target] = await client.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, targetStaffId)).limit(1);
      if (!target) return failed("COVERAGE_TARGET_NOT_FOUND", "The selected swap target no longer exists.");
    }

    const [[pending], [duplicate]] = await Promise.all([
      client.select({ value: count() }).from(coverageRequests).where(and(
        eq(coverageRequests.requesterStaffId, requesterStaffId),
        inArray(coverageRequests.status, pendingStatuses),
      )),
      client.select({ id: coverageRequests.id }).from(coverageRequests).where(and(
        eq(coverageRequests.requesterStaffId, requesterStaffId),
        eq(coverageRequests.shiftId, command.shiftId),
        inArray(coverageRequests.status, pendingStatuses),
      )).limit(1),
    ]);
    if ((pending?.value ?? 0) >= 3) return failed("PENDING_REQUEST_LIMIT", "You already have three coverage requests awaiting action.");
    if (duplicate) return failed("COVERAGE_REQUEST_EXISTS", "This shift already has an active coverage request.");

    const expiresAt = type === "drop" ? new Date(ownedShift.startsAt.getTime() - 24 * 60 * 60 * 1000) : null;
    if (expiresAt && expiresAt <= new Date()) return failed("DROP_REQUEST_EXPIRED", "Drop requests close 24 hours before the shift starts.");

    const status = type === "swap" ? "pending_target" as const : "open" as const;
    const [request] = await tx.insert(coverageRequests).values({
      shiftId: command.shiftId,
      requesterStaffId,
      targetStaffId,
      type,
      status,
      reason: command.reason?.trim() || null,
      expiresAt,
    }).returning({ id: coverageRequests.id });

    if (targetStaffId) {
      await tx.insert(notifications).values({
        userId: targetStaffId,
        type: "SWAP_REQUEST_RECEIVED",
        title: "Swap request received",
        message: "A coworker asked you to take one of their shifts.",
        link: `/schedule?week=${ownedShift.weekStartDate}&shift=${command.shiftId}#shift-${command.shiftId}`,
      });
    }
    await appendAuditAndEvent(client, {
      actorId: requesterStaffId,
      action: type === "swap" ? "SWAP_REQUEST_CREATED" : "DROP_REQUEST_CREATED",
      requestId: request.id,
      shiftId: command.shiftId,
      afterStatus: status,
      recipients: targetStaffId ? [targetStaffId] : [],
    });
    return { success: true as const, requestId: request.id };
  });
}

export function createSwapRequest(command: SwapCommand, actor: EnrichedSession) {
  return createRequest(command, actor, "swap");
}

export function createDropRequest(command: DropCommand, actor: EnrichedSession) {
  return createRequest(command, actor, "drop");
}

export async function acceptSwapRequest(requestId: string, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    const client = tx as unknown as typeof db;
    const request = await lockRequest(client, requestId);
    if (!request || request.type !== "swap" || request.status !== "pending_target") {
      return failed("COVERAGE_STATE_CHANGED", "This swap request is no longer awaiting acceptance.");
    }
    if (!isStaff(actor) || request.targetStaffId !== actor.session.user.id) {
      return failed("COVERAGE_ACTION_FORBIDDEN", "Only the requested coworker can accept this swap.");
    }

    const acceptedAt = new Date();
    await tx.update(coverageRequests).set({
      status: "accepted_by_target",
      acceptedAt,
      version: sql`${coverageRequests.version} + 1`,
    }).where(eq(coverageRequests.id, request.id));
    await tx.insert(notifications).values({
      userId: request.requesterStaffId,
      type: "SWAP_REQUEST_ACCEPTED",
      title: "Swap accepted",
      message: "Your coworker accepted the swap. A manager still needs to approve it.",
      link: `/schedule?shift=${request.shiftId}#shift-${request.shiftId}`,
    });
    await appendAuditAndEvent(client, {
      actorId: actor.session.user.id,
      action: "SWAP_REQUEST_ACCEPTED",
      requestId: request.id,
      shiftId: request.shiftId,
      beforeStatus: request.status,
      afterStatus: "accepted_by_target",
      recipients: [request.requesterStaffId],
    });
    return { success: true as const };
  });
}

export async function claimDropRequest(requestId: string, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    const client = tx as unknown as typeof db;
    const request = await lockRequest(client, requestId);
    if (!request || request.type !== "drop" || request.status !== "open") {
      return failed("COVERAGE_STATE_CHANGED", "This drop request is no longer open.");
    }
    if (!isStaff(actor) || request.requesterStaffId === actor.session.user.id) {
      return failed("COVERAGE_ACTION_FORBIDDEN", "Another staff member must claim this shift.");
    }
    await lockStaff(client, [actor.session.user.id]);
    if (!request.expiresAt || request.expiresAt <= new Date()) {
      await tx.update(coverageRequests).set({
        status: "expired",
        version: sql`${coverageRequests.version} + 1`,
      }).where(eq(coverageRequests.id, request.id));
      await appendAuditAndEvent(client, {
        actorId: actor.session.user.id,
        action: "DROP_REQUEST_EXPIRED",
        requestId: request.id,
        shiftId: request.shiftId,
        beforeStatus: request.status,
        afterStatus: "expired",
      });
      return failed("DROP_REQUEST_EXPIRED", "This drop request closed 24 hours before the shift start.");
    }

    const acceptedAt = new Date();
    await tx.update(coverageRequests).set({
      status: "claimed",
      claimantStaffId: actor.session.user.id,
      acceptedAt,
      version: sql`${coverageRequests.version} + 1`,
    }).where(eq(coverageRequests.id, request.id));
    await tx.insert(notifications).values({
      userId: request.requesterStaffId,
      type: "DROP_REQUEST_CLAIMED",
      title: "Drop request claimed",
      message: "A coworker offered to cover your shift. A manager still needs to approve it.",
      link: `/schedule?shift=${request.shiftId}#shift-${request.shiftId}`,
    });
    await appendAuditAndEvent(client, {
      actorId: actor.session.user.id,
      action: "DROP_REQUEST_CLAIMED",
      requestId: request.id,
      shiftId: request.shiftId,
      beforeStatus: request.status,
      afterStatus: "claimed",
      recipients: [request.requesterStaffId],
    });
    return { success: true as const };
  });
}

async function approveRequest(requestId: string, actor: EnrichedSession, type: CoverageType) {
  try {
    return await db.transaction(async (tx) => {
      const client = tx as unknown as typeof db;
      const request = await lockRequest(client, requestId);
      const expectedStatus = type === "swap" ? "accepted_by_target" : "claimed";
      if (!request || request.type !== type || request.status !== expectedStatus) {
        return failed("COVERAGE_STATE_CHANGED", "This coverage request is no longer ready for approval.");
      }
      const [shift] = await client.select().from(shifts).where(and(eq(shifts.id, request.shiftId), eq(shifts.status, "active"))).limit(1);
      if (!shift) return failed("COVERAGE_SHIFT_NOT_FOUND", "The shift no longer exists.");
      if (!(await canManageLocation(client, actor, shift.locationId))) {
        return failed("MANAGER_LOCATION_UNAUTHORIZED", "You are not authorized to approve coverage at this location.");
      }

      const incomingStaffId = type === "swap" ? request.targetStaffId : request.claimantStaffId;
      if (!incomingStaffId) return failed("COVERAGE_TARGET_NOT_FOUND", "The replacement staff member is missing.");
      await lockStaff(client, [request.requesterStaffId, incomingStaffId]);

      const [outgoingAssignment] = await client.select().from(assignments).where(and(
        eq(assignments.shiftId, request.shiftId),
        eq(assignments.staffId, request.requesterStaffId),
        eq(assignments.status, "assigned"),
      )).limit(1);
      if (!outgoingAssignment) return failed("COVERAGE_ASSIGNMENT_CHANGED", "The original assignment is no longer active.");

      const loaded = await loadEvaluationInput(client, { shiftId: request.shiftId, staffId: incomingStaffId }, { headcountCredit: 1 });
      if (!loaded) return failed("COVERAGE_TARGET_NOT_FOUND", "The replacement staff member or shift no longer exists.");
      if (loaded.evaluation.blockers.length) return { success: false as const, blockers: loaded.evaluation.blockers };

      const approvedAt = new Date();
      await tx.delete(assignmentPeriods).where(eq(assignmentPeriods.assignmentId, outgoingAssignment.id));
      await tx.update(assignments).set({
        status: "removed",
        removedAt: approvedAt,
        removedBy: actor.session.user.id,
        updatedAt: approvedAt,
      }).where(eq(assignments.id, outgoingAssignment.id));
      const [replacement] = await tx.insert(assignments).values({
        shiftId: request.shiftId,
        staffId: incomingStaffId,
        assignedBy: actor.session.user.id,
      }).returning({ id: assignments.id });
      await tx.insert(assignmentPeriods).values({
        assignmentId: replacement.id,
        staffId: incomingStaffId,
        workPeriod: `[${shift.startsAt.toISOString()},${shift.endsAt.toISOString()})`,
      });
      await tx.update(coverageRequests).set({
        status: "approved",
        approvedAt,
        approvedBy: actor.session.user.id,
        version: sql`${coverageRequests.version} + 1`,
      }).where(eq(coverageRequests.id, request.id));
      await tx.update(scheduleWeeks).set({
        version: sql`${scheduleWeeks.version} + 1`,
        updatedAt: approvedAt,
      }).where(eq(scheduleWeeks.id, shift.scheduleWeekId));

      await tx.insert(notifications).values([
        {
          userId: request.requesterStaffId,
          type: "COVERAGE_REQUEST_APPROVED",
          title: "Coverage approved",
          message: "A manager approved your coverage request. You are no longer assigned to this shift.",
          link: `/schedule?shift=${request.shiftId}#shift-${request.shiftId}`,
        },
        {
          userId: incomingStaffId,
          type: "COVERAGE_REQUEST_APPROVED",
          title: "Coverage approved",
          message: "A manager approved the coverage request. This shift is now assigned to you.",
          link: `/schedule?shift=${request.shiftId}#shift-${request.shiftId}`,
        },
      ]);
      await appendAuditAndEvent(client, {
        actorId: actor.session.user.id,
        action: type === "swap" ? "SWAP_REQUEST_APPROVED" : "DROP_REQUEST_APPROVED",
        requestId: request.id,
        shiftId: request.shiftId,
        beforeStatus: request.status,
        afterStatus: "approved",
        recipients: [request.requesterStaffId, incomingStaffId],
      });
      return { success: true as const };
    });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if ([databaseError.code, databaseError.cause?.code].some((code) => code === "23P01" || code === "23505")) {
      return failed("CONCURRENT_ASSIGNMENT_CONFLICT", "The schedule changed while coverage approval was being saved.");
    }
    throw error;
  }
}

export function approveSwapRequest(requestId: string, actor: EnrichedSession) {
  return approveRequest(requestId, actor, "swap");
}

export function approveDropRequest(requestId: string, actor: EnrichedSession) {
  return approveRequest(requestId, actor, "drop");
}

export async function cancelCoverageRequest(requestId: string, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    const client = tx as unknown as typeof db;
    const request = await lockRequest(client, requestId);
    if (!request || !pendingStatuses.includes(request.status as PendingStatus)) {
      return failed("COVERAGE_STATE_CHANGED", "This coverage request can no longer be cancelled.");
    }
    if (request.requesterStaffId !== actor.session.user.id) {
      return failed("COVERAGE_ACTION_FORBIDDEN", "Only the requesting staff member can cancel this request.");
    }

    const cancelledAt = new Date();
    await tx.update(coverageRequests).set({
      status: "cancelled",
      cancelledAt,
      cancelReason: "Cancelled by requester",
      version: sql`${coverageRequests.version} + 1`,
    }).where(eq(coverageRequests.id, request.id));
    const affected = [request.targetStaffId, request.claimantStaffId].filter((id): id is string => Boolean(id));
    if (affected.length) {
      await tx.insert(notifications).values(affected.map((userId) => ({
        userId,
        type: "COVERAGE_REQUEST_CANCELLED",
        title: "Coverage request cancelled",
        message: "The requesting staff member cancelled this coverage request. No assignment changed.",
        link: `/schedule?shift=${request.shiftId}#shift-${request.shiftId}`,
      })));
    }
    await appendAuditAndEvent(client, {
      actorId: actor.session.user.id,
      action: "COVERAGE_REQUEST_CANCELLED",
      requestId: request.id,
      shiftId: request.shiftId,
      beforeStatus: request.status,
      afterStatus: "cancelled",
      recipients: affected,
    });
    return { success: true as const };
  });
}
