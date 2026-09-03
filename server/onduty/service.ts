import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  assignments,
  auditLogs,
  outboxEvents,
  scheduleWeeks,
  shifts,
  timeEntries,
} from "@/server/db/schema";
export { getOnDutyStaff } from "./queries";

const failed = (code: string, message: string) => ({
  success: false as const,
  blockers: [{ code, severity: "BLOCK" as const, message, details: {} }],
});

function onDutyEvent(values: { eventId: string; type: "clock_in" | "clock_out"; locationId: string; timeEntryId: string; staffId: string }) {
  return {
    id: values.eventId,
    channel: `private-location-${values.locationId}`,
    event: `onduty.${values.type}`,
    payload: {
      eventId: values.eventId,
      timeEntryId: values.timeEntryId,
      staffId: values.staffId,
      locationId: values.locationId,
    },
  };
}

export async function clockInStaff(command: { assignmentId: string }, actor: EnrichedSession) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select user_id from staff_profiles where user_id = ${actor.session.user.id} for update`);
      await tx.execute(sql`select id from assignments where id = ${command.assignmentId} for update`);
      const [assignment] = await tx.select({
        id: assignments.id,
        staffId: assignments.staffId,
        status: assignments.status,
        shiftId: shifts.id,
        locationId: shifts.locationId,
      }).from(assignments)
        .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
        .innerJoin(scheduleWeeks, eq(shifts.scheduleWeekId, scheduleWeeks.id))
        .where(and(
          eq(assignments.id, command.assignmentId),
          eq(assignments.staffId, actor.session.user.id),
          eq(assignments.status, "assigned"),
          eq(shifts.status, "active"),
          sql`${shifts.endsAt} > now()`,
          eq(scheduleWeeks.status, "published"),
        ))
        .limit(1);
      if (!assignment) return failed("ONDUTY_ASSIGNMENT_FORBIDDEN", "You can only clock in to your own active assignment.");

      const [openEntry] = await tx.select({ id: timeEntries.id }).from(timeEntries).where(and(
        eq(timeEntries.staffId, actor.session.user.id),
        isNull(timeEntries.clockOutAt),
      )).limit(1);
      if (openEntry) return failed("STAFF_ALREADY_CLOCKED_IN", "Clock out of your current shift before starting another one.");

      const clockInAt = new Date();
      const [entry] = await tx.insert(timeEntries).values({
        assignmentId: assignment.id,
        staffId: actor.session.user.id,
        locationId: assignment.locationId,
        clockInAt,
      }).returning({ id: timeEntries.id });
      await tx.insert(auditLogs).values({
        actorId: actor.session.user.id,
        action: "STAFF_CLOCKED_IN",
        entityType: "time_entry",
        entityId: entry.id,
        afterState: { assignmentId: assignment.id, shiftId: assignment.shiftId, locationId: assignment.locationId, clockInAt: clockInAt.toISOString() },
      });
      const eventId = randomUUID();
      await tx.insert(outboxEvents).values(onDutyEvent({
        eventId,
        type: "clock_in",
        locationId: assignment.locationId,
        timeEntryId: entry.id,
        staffId: actor.session.user.id,
      }));
      return { success: true as const, timeEntryId: entry.id, eventId };
    });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if ([databaseError.code, databaseError.cause?.code].includes("23505")) {
      return failed("STAFF_ALREADY_CLOCKED_IN", "Clock out of your current shift before starting another one.");
    }
    throw error;
  }
}

export async function clockOutStaff(command: { timeEntryId: string }, actor: EnrichedSession) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select user_id from staff_profiles where user_id = ${actor.session.user.id} for update`);
    await tx.execute(sql`select id from time_entries where id = ${command.timeEntryId} for update`);
    const [entry] = await tx.select().from(timeEntries).where(and(
      eq(timeEntries.id, command.timeEntryId),
      eq(timeEntries.staffId, actor.session.user.id),
      isNull(timeEntries.clockOutAt),
    )).limit(1);
    if (!entry) return failed("ONDUTY_ENTRY_NOT_OPEN", "This active time entry could not be found.");

    const clockOutAt = new Date();
    await tx.update(timeEntries).set({ clockOutAt }).where(eq(timeEntries.id, entry.id));
    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      action: "STAFF_CLOCKED_OUT",
      entityType: "time_entry",
      entityId: entry.id,
      beforeState: { clockOutAt: null },
      afterState: { clockOutAt: clockOutAt.toISOString() },
    });
    const eventId = randomUUID();
    await tx.insert(outboxEvents).values(onDutyEvent({
      eventId,
      type: "clock_out",
      locationId: entry.locationId,
      timeEntryId: entry.id,
      staffId: actor.session.user.id,
    }));
    return { success: true as const, eventId };
  });
}
