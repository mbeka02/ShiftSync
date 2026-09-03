import { and, eq, inArray } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  assignments,
  availabilityExceptions,
  availabilityRules,
  scheduleWeeks,
  shifts,
  staffLocationCertifications,
  staffProfiles,
  staffSkills,
  userProfiles,
} from "@/server/db/schema";
import { canManageLocation } from "@/server/scheduling/assignment";
import { isShiftWithinAvailability } from "@/server/scheduling/constraints";

const round = (value: number) => Math.round(value * 100) / 100;
const validOn = (date: string, item: { validFrom: string; validTo: string | null }) =>
  item.validFrom <= date && (item.validTo === null || item.validTo >= date);

export async function getFairnessReport(
  locationId: string,
  scheduleWeekId: string,
  actor: EnrichedSession,
) {
  const empty = {
    summary: { totalPremiumShifts: 0, totalFilledPremiumAssignments: 0, totalEligibleOpportunities: 0 },
    staffFairness: [] as Array<Record<string, unknown>>,
  };
  if (!(await canManageLocation(db, actor, locationId))) {
    return { success: false as const, code: "FORBIDDEN" as const, ...empty };
  }
  const [week] = await db.select({ id: scheduleWeeks.id }).from(scheduleWeeks).where(and(
    eq(scheduleWeeks.id, scheduleWeekId),
    eq(scheduleWeeks.locationId, locationId),
  )).limit(1);
  if (!week) return { success: false as const, code: "SCHEDULE_WEEK_NOT_FOUND" as const, ...empty };

  const premiumShifts = await db.select().from(shifts).where(and(
    eq(shifts.scheduleWeekId, scheduleWeekId),
    eq(shifts.locationId, locationId),
    eq(shifts.status, "active"),
    eq(shifts.premium, true),
  ));
  const candidates = await db.select({
    staffId: staffProfiles.userId,
    firstName: userProfiles.firstName,
    lastName: userProfiles.lastName,
    desiredWeeklyHours: staffProfiles.desiredWeeklyHours,
    primaryTimezone: staffProfiles.primaryTimezone,
    certificationValidFrom: staffLocationCertifications.validFrom,
    certificationValidTo: staffLocationCertifications.validTo,
  }).from(staffLocationCertifications)
    .innerJoin(staffProfiles, eq(staffLocationCertifications.staffId, staffProfiles.userId))
    .innerJoin(userProfiles, eq(staffProfiles.userId, userProfiles.userId))
    .where(and(
      eq(staffLocationCertifications.locationId, locationId),
      eq(staffLocationCertifications.status, "active"),
      eq(userProfiles.status, "active"),
    ));
  const staffIds = [...new Set(candidates.map((row) => row.staffId))];
  const shiftIds = premiumShifts.map((shift) => shift.id);
  const [skillRows, ruleRows, exceptionRows, assignmentRows] = await Promise.all([
    staffIds.length ? db.select().from(staffSkills).where(inArray(staffSkills.staffId, staffIds)) : Promise.resolve([]),
    staffIds.length ? db.select().from(availabilityRules).where(inArray(availabilityRules.staffId, staffIds)) : Promise.resolve([]),
    staffIds.length ? db.select().from(availabilityExceptions).where(inArray(availabilityExceptions.staffId, staffIds)) : Promise.resolve([]),
    shiftIds.length ? db.select().from(assignments).where(and(inArray(assignments.shiftId, shiftIds), eq(assignments.status, "assigned"))) : Promise.resolve([]),
  ]);

  const uniqueCandidates = [...new Map(candidates.map((row) => [row.staffId, row])).values()];
  const evidenceByStaff = new Map(uniqueCandidates.map((person) => [person.staffId, [] as Array<Record<string, unknown>>]));
  for (const shift of premiumShifts) {
    for (const person of uniqueCandidates) {
      const certification = candidates.find((row) => row.staffId === person.staffId && validOn(shift.localStartDate, {
        validFrom: row.certificationValidFrom,
        validTo: row.certificationValidTo,
      }));
      const qualified = skillRows.some((skill) => skill.staffId === person.staffId && skill.skillId === shift.requiredSkillId && validOn(shift.localStartDate, skill));
      const rules = ruleRows.filter((rule) => rule.staffId === person.staffId);
      const exceptions = exceptionRows.filter((exception) => exception.staffId === person.staffId);
      const available = rules.length === 0 && exceptions.length === 0
        ? true
        : isShiftWithinAvailability({ availabilityRules: rules, availabilityExceptions: exceptions }, shift);
      const eligible = Boolean(certification && qualified && available);
      const assigned = assignmentRows.some((assignment) => assignment.staffId === person.staffId && assignment.shiftId === shift.id);
      evidenceByStaff.get(person.staffId)!.push({
        shiftId: shift.id,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        requiredSkillId: shift.requiredSkillId,
        eligible,
        assigned,
        qualification: { certified: Boolean(certification), skilled: qualified, available },
      });
    }
  }

  const totalFilledPremiumAssignments = assignmentRows.length;
  const totalEligibleOpportunities = [...evidenceByStaff.values()].flat().filter((entry) => entry.eligible).length;
  const staffFairness = uniqueCandidates.map((person) => {
    const evidence = evidenceByStaff.get(person.staffId)!;
    const eligiblePremiumOpportunities = evidence.filter((entry) => entry.eligible).length;
    const actualPremiumShifts = evidence.filter((entry) => entry.assigned).length;
    const expectedPremiumShifts = totalEligibleOpportunities === 0
      ? 0
      : round(totalFilledPremiumAssignments * eligiblePremiumOpportunities / totalEligibleOpportunities);
    return {
      staffId: person.staffId,
      staffName: `${person.firstName} ${person.lastName}`,
      desiredWeeklyHours: person.desiredWeeklyHours,
      eligiblePremiumOpportunities,
      actualPremiumShifts,
      expectedPremiumShifts,
      premiumFairnessRatio: expectedPremiumShifts === 0 ? null : round(actualPremiumShifts / expectedPremiumShifts),
      evidence,
    };
  });

  return {
    success: true as const,
    summary: { totalPremiumShifts: premiumShifts.length, totalFilledPremiumAssignments, totalEligibleOpportunities },
    staffFairness,
  };
}
