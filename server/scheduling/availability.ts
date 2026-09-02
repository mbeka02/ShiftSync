import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignments,
  availabilityExceptions,
  availabilityRules,
  managerLocations,
  notifications,
  outboxEvents,
  scheduleWeeks,
  shifts,
  staffProfiles,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { isShiftWithinAvailability } from "./constraints";

type AvailabilityRuleInput = {
  weekday: number;
  startLocalTime: string;
  endLocalTime: string;
  timezone: string;
  validFrom?: string;
  validTo?: string | null;
};

const hasRole = (actor: EnrichedSession, role: string) => actor.roles.some((entry) => entry.code === role);

export async function updateStaffAvailability(staffId: string, rules: AvailabilityRuleInput[], actor: EnrichedSession) {
  if (actor.session.user.id !== staffId && !hasRole(actor, "admin")) {
    return { success: false as const, code: "FORBIDDEN" as const, flaggedCount: 0 };
  }
  if (rules.some((rule) => rule.weekday < 1 || rule.weekday > 7 || !rule.timezone || rule.startLocalTime === rule.endLocalTime)) {
    return { success: false as const, code: "INVALID_AVAILABILITY" as const, flaggedCount: 0 };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select user_id from staff_profiles where user_id = ${staffId} for update`);
    const client = tx as unknown as typeof db;
    const [staff] = await client.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, staffId)).limit(1);
    if (!staff) return { success: false as const, code: "STAFF_NOT_FOUND" as const, flaggedCount: 0 };

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    await tx.update(availabilityRules).set({ active: false }).where(and(
      eq(availabilityRules.staffId, staffId),
      eq(availabilityRules.active, true),
    ));
    if (rules.length) {
      await tx.insert(availabilityRules).values(rules.map((rule) => ({
        staffId,
        weekday: rule.weekday,
        startLocalTime: rule.startLocalTime,
        endLocalTime: rule.endLocalTime,
        timezone: rule.timezone,
        validFrom: rule.validFrom ?? today,
        validTo: rule.validTo ?? null,
        active: true,
      })));
    }

    const [exceptions, futureAssignments] = await Promise.all([
      client.select({
        exceptionDate: availabilityExceptions.exceptionDate,
        type: availabilityExceptions.type,
        startLocalTime: availabilityExceptions.startLocalTime,
        endLocalTime: availabilityExceptions.endLocalTime,
        timezone: availabilityExceptions.timezone,
      }).from(availabilityExceptions).where(and(
        eq(availabilityExceptions.staffId, staffId),
        gte(availabilityExceptions.exceptionDate, today),
      )),
      client.select({
        assignmentId: assignments.id,
        riskFlags: assignments.riskFlags,
        shiftId: shifts.id,
        startsAt: shifts.startsAt,
        endsAt: shifts.endsAt,
        locationId: shifts.locationId,
        weekStartDate: scheduleWeeks.weekStartDate,
      }).from(assignments)
        .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
        .innerJoin(scheduleWeeks, eq(shifts.scheduleWeekId, scheduleWeeks.id))
        .where(and(
          eq(assignments.staffId, staffId),
          eq(assignments.status, "assigned"),
          eq(shifts.status, "active"),
          gte(shifts.startsAt, now),
        )),
    ]);

    const normalizedRules = rules.map((rule) => ({
      ...rule,
      validFrom: rule.validFrom ?? today,
      validTo: rule.validTo ?? null,
      active: true,
    }));
    const newlyAtRisk = futureAssignments.filter((assignment) =>
      !assignment.riskFlags.includes("AT_RISK_AVAILABILITY")
      && !isShiftWithinAvailability(
        { availabilityRules: normalizedRules, availabilityExceptions: exceptions },
        { startsAt: assignment.startsAt, endsAt: assignment.endsAt },
      ));
    if (!newlyAtRisk.length) return { success: true as const, flaggedCount: 0 };

    await tx.update(assignments).set({
      riskFlags: sql`array_append(${assignments.riskFlags}, 'AT_RISK_AVAILABILITY')`,
      updatedAt: now,
    }).where(inArray(assignments.id, newlyAtRisk.map((assignment) => assignment.assignmentId)));

    const locationIds = [...new Set(newlyAtRisk.map((assignment) => assignment.locationId))];
    const managers = await client.select({
      managerId: managerLocations.managerUserId,
      locationId: managerLocations.locationId,
    }).from(managerLocations).where(and(
      inArray(managerLocations.locationId, locationIds),
      lte(managerLocations.validFrom, today),
      or(isNull(managerLocations.validTo), gte(managerLocations.validTo, today)),
    ));
    const managerByLocation = new Map<string, string[]>();
    for (const manager of managers) {
      managerByLocation.set(manager.locationId, [...(managerByLocation.get(manager.locationId) ?? []), manager.managerId]);
    }

    const notificationRows = newlyAtRisk.flatMap((assignment) =>
      (managerByLocation.get(assignment.locationId) ?? []).map((managerId) => ({
        userId: managerId,
        type: "ASSIGNMENT_AT_RISK",
        title: "Assignment needs coverage review",
        message: "A staff member’s updated availability no longer covers an assigned shift.",
        link: `/schedule?week=${assignment.weekStartDate}&location=${assignment.locationId}&shift=${assignment.shiftId}#shift-${assignment.shiftId}`,
      })));
    if (notificationRows.length) await tx.insert(notifications).values(notificationRows);

    await tx.insert(outboxEvents).values(newlyAtRisk.map((assignment) => {
      const eventId = randomUUID();
      return {
        id: eventId,
        channel: `private-location-${assignment.locationId}`,
        event: "assignment.at-risk",
        payload: {
          eventId,
          assignmentId: assignment.assignmentId,
          shiftId: assignment.shiftId,
          staffId,
          riskFlag: "AT_RISK_AVAILABILITY",
        },
      };
    }));
    return { success: true as const, flaggedCount: newlyAtRisk.length };
  });
}
