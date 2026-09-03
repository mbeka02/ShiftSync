import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignmentPeriods,
  assignments,
  auditLogs,
  outboxEvents,
  scheduleWeeks,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { canManageLocation, loadEvaluationInput } from "./assignment";
import type { ConstraintViolation } from "./constraints";
import { dispatchNotifications } from "@/server/notifications/service";

type EmergencyCoverageCommand = { shiftId: string; staffId: string; reason: string };

const blocked = (code: string, message: string): ConstraintViolation => ({ code, severity: "BLOCK", message, details: {} });

export async function assignEmergencyCoverage(command: EmergencyCoverageCommand, actor: EnrichedSession) {
  const reason = command.reason?.trim();
  if (!reason) {
    return { success: false as const, blockers: [blocked("EMERGENCY_REASON_REQUIRED", "A documented reason is required for emergency coverage.")] };
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select id from shifts where id = ${command.shiftId} for update`);
      await tx.execute(sql`select user_id from staff_profiles where user_id = ${command.staffId} for update`);
      const client = tx as unknown as typeof db;
      const loaded = await loadEvaluationInput(client, command);
      if (!loaded) return { success: false as const, blockers: [blocked("ASSIGNMENT_TARGET_NOT_FOUND", "The shift or staff member no longer exists.")] };
      if (!(await canManageLocation(client, actor, loaded.shift.locationId))) {
        return { success: false as const, blockers: [blocked("MANAGER_LOCATION_UNAUTHORIZED", "You are not authorized to manage this shift’s location.")] };
      }
      if (loaded.evaluation.blockers.length) return { success: false as const, blockers: loaded.evaluation.blockers };

      const [assignment] = await tx.insert(assignments).values({
        shiftId: command.shiftId,
        staffId: command.staffId,
        assignedBy: actor.session.user.id,
      }).returning({ id: assignments.id });
      await tx.insert(assignmentPeriods).values({
        assignmentId: assignment.id,
        staffId: command.staffId,
        workPeriod: `[${loaded.shift.startsAt.toISOString()},${loaded.shift.endsAt.toISOString()})`,
      });
      await tx.update(scheduleWeeks).set({
        version: sql`${scheduleWeeks.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(scheduleWeeks.id, loaded.shift.scheduleWeekId));
      await tx.insert(auditLogs).values({
        actorId: actor.session.user.id,
        action: "EMERGENCY_COVERAGE_REPLACE",
        entityType: "assignment",
        entityId: assignment.id,
        locationId: loaded.shift.locationId,
        afterState: { assignmentId: assignment.id, shiftId: command.shiftId, staffId: command.staffId, reason },
      });
      const [week] = await client.select({ weekStartDate: scheduleWeeks.weekStartDate })
        .from(scheduleWeeks)
        .where(eq(scheduleWeeks.id, loaded.shift.scheduleWeekId))
        .limit(1);
      await dispatchNotifications(client, [{
        userId: command.staffId,
        type: "EMERGENCY_COVERAGE_ASSIGNED",
        title: "Emergency coverage assigned",
        message: "You have been assigned emergency coverage. Review the shift details before service.",
        link: `/schedule?week=${week?.weekStartDate ?? ""}&shift=${command.shiftId}#shift-${command.shiftId}`,
      }]);
      const events = [`private-location-${loaded.shift.locationId}`, `private-user-${command.staffId}`].map((channel) => {
        const eventId = randomUUID();
        return {
          id: eventId,
          channel,
          event: "emergency-coverage.assigned",
          payload: {
            eventId,
            assignmentId: assignment.id,
            shiftId: command.shiftId,
            staffId: command.staffId,
            scheduleWeekId: loaded.shift.scheduleWeekId,
          },
        };
      });
      await tx.insert(outboxEvents).values(events);
      return { success: true as const, assignmentId: assignment.id, eventIds: events.map((event) => event.id) };
    });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if ([databaseError.code, databaseError.cause?.code].some((code) => code === "23P01" || code === "23505")) {
      return { success: false as const, blockers: [blocked("CONCURRENT_ASSIGNMENT_CONFLICT", "The schedule changed while emergency coverage was being saved.")] };
    }
    throw error;
  }
}
