import { and, count, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignments,
  assignmentPeriods,
  availabilityExceptions,
  availabilityRules,
  managerLocations,
  scheduleWeeks,
  shifts,
  staffLocationCertifications,
  staffProfiles,
  staffSkills,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { evaluateAssignment, type ConstraintViolation } from "./constraints";

export type AssignmentCommand = {
  shiftId: string;
  staffId: string;
  managerOverride?: boolean;
  overrideReason?: string;
};

const hasRole = (actor: EnrichedSession, role: string) => actor.roles.some((entry) => entry.code === role);

export async function canManageLocation(client: typeof db, actor: EnrichedSession, locationId: string) {
  if (hasRole(actor, "admin")) return true;
  if (!hasRole(actor, "manager")) return false;
  const today = new Date().toISOString().slice(0, 10);
  const [scope] = await client.select({ locationId: managerLocations.locationId }).from(managerLocations).where(and(
    eq(managerLocations.managerUserId, actor.session.user.id),
    eq(managerLocations.locationId, locationId),
    lte(managerLocations.validFrom, today),
    or(isNull(managerLocations.validTo), gte(managerLocations.validTo, today)),
  )).limit(1);
  return Boolean(scope);
}

export async function loadEvaluationInput(client: typeof db, command: AssignmentCommand, options: { headcountCredit?: number } = {}) {
  const [shift] = await client.select().from(shifts).where(and(eq(shifts.id, command.shiftId), eq(shifts.status, "active"))).limit(1);
  if (!shift) return null;
  const [staff, skills, certifications, rules, exceptions, existing, [headcount]] = await Promise.all([
    client.select().from(staffProfiles).where(eq(staffProfiles.userId, command.staffId)).limit(1).then((rows) => rows[0]),
    client.select().from(staffSkills).where(eq(staffSkills.staffId, command.staffId)),
    client.select().from(staffLocationCertifications).where(eq(staffLocationCertifications.staffId, command.staffId)),
    client.select().from(availabilityRules).where(eq(availabilityRules.staffId, command.staffId)),
    client.select().from(availabilityExceptions).where(eq(availabilityExceptions.staffId, command.staffId)),
    client.select({
      shiftId: shifts.id,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      status: assignments.status,
    }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id)).where(and(
      eq(assignments.staffId, command.staffId),
      eq(assignments.status, "assigned"),
      eq(shifts.status, "active"),
    )),
    client.select({ value: count() }).from(assignments).where(and(eq(assignments.shiftId, command.shiftId), eq(assignments.status, "assigned"))),
  ]);
  if (!staff) return null;
  return {
    shift,
    evaluation: evaluateAssignment({
      candidateStaff: {
        id: staff.userId,
        primaryTimezone: staff.primaryTimezone,
        skills: skills.map((item) => ({ skillId: item.skillId, validFrom: item.validFrom, validTo: item.validTo })),
        certifications: certifications.map((item) => ({ locationId: item.locationId, validFrom: item.validFrom, validTo: item.validTo, status: item.status })),
        availabilityRules: rules.map((item) => ({
          weekday: item.weekday,
          startLocalTime: item.startLocalTime,
          endLocalTime: item.endLocalTime,
          timezone: item.timezone,
          validFrom: item.validFrom,
          validTo: item.validTo,
          active: item.active,
        })),
        availabilityExceptions: exceptions.map((item) => ({
          exceptionDate: item.exceptionDate,
          type: item.type,
          startLocalTime: item.startLocalTime,
          endLocalTime: item.endLocalTime,
          timezone: item.timezone,
        })),
      },
      candidateShift: {
        id: shift.id,
        locationId: shift.locationId,
        requiredSkillId: shift.requiredSkillId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        timezone: shift.timezone,
        headcount: shift.headcount,
      },
      existingAssignments: existing,
      activeAssignmentCount: Math.max(0, (headcount?.value ?? 0) - (options.headcountCredit ?? 0)),
      managerOverride: command.managerOverride,
    }),
  };
}

function unauthorized(): ConstraintViolation {
  return {
    code: "MANAGER_LOCATION_UNAUTHORIZED",
    severity: "BLOCK",
    message: "You are not authorized to manage this shift’s location.",
    details: {},
  };
}

function missingRecord(): ConstraintViolation {
  return { code: "ASSIGNMENT_TARGET_NOT_FOUND", severity: "BLOCK", message: "The shift or staff member no longer exists.", details: {} };
}

export async function previewAssignment(command: AssignmentCommand, actor: EnrichedSession) {
  const loaded = await loadEvaluationInput(db, command);
  if (!loaded) return { blockers: [missingRecord()], warnings: [], impact: { projectedDailyHours: 0, projectedWeeklyHours: 0, projectedConsecutiveDays: 0, overtime: false } };
  if (!(await canManageLocation(db, actor, loaded.shift.locationId))) {
    return { ...loaded.evaluation, blockers: [unauthorized(), ...loaded.evaluation.blockers] };
  }
  return loaded.evaluation;
}

export async function assignStaff(command: AssignmentCommand, actor: EnrichedSession) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select id from shifts where id = ${command.shiftId} for update`);
      await tx.execute(sql`select user_id from staff_profiles where user_id = ${command.staffId} for update`);
      const client = tx as unknown as typeof db;
      const loaded = await loadEvaluationInput(client, command);
      if (!loaded) return { success: false as const, blockers: [missingRecord()] };
      if (!(await canManageLocation(client, actor, loaded.shift.locationId))) {
        return { success: false as const, blockers: [unauthorized()] };
      }
      if (loaded.evaluation.blockers.length) {
        return { success: false as const, blockers: loaded.evaluation.blockers };
      }
      if (command.managerOverride && !command.overrideReason?.trim()) {
        return {
          success: false as const,
          blockers: [{
            code: "SEVENTH_DAY_OVERRIDE_REQUIRED",
            severity: "BLOCK" as const,
            message: "A documented reason is required for a manager override.",
            details: {},
          }],
        };
      }

      const [assignment] = await tx.insert(assignments).values({
        shiftId: command.shiftId,
        staffId: command.staffId,
        assignedBy: actor.session.user.id,
        managerOverride: command.managerOverride ?? false,
        overrideReason: command.managerOverride ? command.overrideReason!.trim() : null,
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
      return { success: true as const, assignmentId: assignment.id };
    });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if ([databaseError.code, databaseError.cause?.code].some((code) => code === "23P01" || code === "23505")) {
      return {
        success: false as const,
        blockers: [{
          code: "CONCURRENT_ASSIGNMENT_CONFLICT",
          severity: "BLOCK" as const,
          message: "The schedule changed while this assignment was being saved.",
          details: {},
        }],
      };
    }
    throw error;
  }
}
