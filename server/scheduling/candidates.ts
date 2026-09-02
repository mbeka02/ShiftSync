import { and, count, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assignments,
  availabilityExceptions,
  availabilityRules,
  locations,
  scheduleWeeks,
  shifts,
  skills,
  staffLocationCertifications,
  staffProfiles,
  staffSkills,
  userProfiles,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { canManageLocation } from "./assignment";
import { evaluateAssignment } from "./constraints";

function groupByStaff<T extends { staffId: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) grouped.set(row.staffId, [...(grouped.get(row.staffId) ?? []), row]);
  return grouped;
}

export async function getAssignmentCandidates(shiftId: string, actor: EnrichedSession) {
  const [shift] = await db.select({
    id: shifts.id,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    timezone: shifts.timezone,
    locationId: shifts.locationId,
    requiredSkillId: shifts.requiredSkillId,
    skillName: skills.name,
    localStartDate: shifts.localStartDate,
    headcount: shifts.headcount,
    weekStatus: scheduleWeeks.status,
    cutoffMinutes: locations.schedulingCutoffMinutes,
  }).from(shifts)
    .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
    .innerJoin(scheduleWeeks, eq(shifts.scheduleWeekId, scheduleWeeks.id))
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .where(and(eq(shifts.id, shiftId), eq(shifts.status, "active")))
    .limit(1);
  if (!shift) return null;
  if (!(await canManageLocation(db, actor, shift.locationId))) return null;

  const staff = await db.selectDistinct({
    staffId: staffProfiles.userId,
    firstName: userProfiles.firstName,
    lastName: userProfiles.lastName,
    primaryTimezone: staffProfiles.primaryTimezone,
  }).from(staffProfiles)
    .innerJoin(userProfiles, eq(staffProfiles.userId, userProfiles.userId))
    .innerJoin(staffLocationCertifications, eq(staffProfiles.userId, staffLocationCertifications.staffId))
    .where(and(
      eq(userProfiles.status, "active"),
      eq(staffLocationCertifications.locationId, shift.locationId),
      eq(staffLocationCertifications.status, "active"),
      lte(staffLocationCertifications.validFrom, shift.localStartDate),
      or(isNull(staffLocationCertifications.validTo), gte(staffLocationCertifications.validTo, shift.localStartDate)),
    ))
    .limit(100);

  const staffIds = staff.map((person) => person.staffId);
  if (!staffIds.length) {
    return {
      shift: {
        id: shift.id,
        skillName: shift.skillName,
        timezone: shift.timezone,
        startsAt: shift.startsAt.toISOString(),
        endsAt: shift.endsAt.toISOString(),
        emergencyCoverageRequired: shift.weekStatus === "published" && shift.startsAt.getTime() - Date.now() < shift.cutoffMinutes * 60_000,
      },
      candidates: [],
    };
  }

  // Six fixed reads replace the former per-candidate preview query fan-out.
  // The seven-day window is sufficient for overlap, rest, weekly hours, and
  // the six neighboring workdays needed by the consecutive-day rule.
  const windowStart = new Date(shift.startsAt.getTime() - 7 * 86_400_000);
  const windowEnd = new Date(shift.endsAt.getTime() + 7 * 86_400_000);
  const [skillRows, certificationRows, ruleRows, exceptionRows, existingRows, [headcount]] = await Promise.all([
    db.select({
      staffId: staffSkills.staffId,
      skillId: staffSkills.skillId,
      validFrom: staffSkills.validFrom,
      validTo: staffSkills.validTo,
    }).from(staffSkills).where(inArray(staffSkills.staffId, staffIds)),
    db.select({
      staffId: staffLocationCertifications.staffId,
      locationId: staffLocationCertifications.locationId,
      validFrom: staffLocationCertifications.validFrom,
      validTo: staffLocationCertifications.validTo,
      status: staffLocationCertifications.status,
    }).from(staffLocationCertifications).where(inArray(staffLocationCertifications.staffId, staffIds)),
    db.select({
      staffId: availabilityRules.staffId,
      weekday: availabilityRules.weekday,
      startLocalTime: availabilityRules.startLocalTime,
      endLocalTime: availabilityRules.endLocalTime,
      timezone: availabilityRules.timezone,
      validFrom: availabilityRules.validFrom,
      validTo: availabilityRules.validTo,
      active: availabilityRules.active,
    }).from(availabilityRules).where(inArray(availabilityRules.staffId, staffIds)),
    db.select({
      staffId: availabilityExceptions.staffId,
      exceptionDate: availabilityExceptions.exceptionDate,
      type: availabilityExceptions.type,
      startLocalTime: availabilityExceptions.startLocalTime,
      endLocalTime: availabilityExceptions.endLocalTime,
      timezone: availabilityExceptions.timezone,
    }).from(availabilityExceptions).where(and(
      inArray(availabilityExceptions.staffId, staffIds),
      gte(availabilityExceptions.exceptionDate, windowStart.toISOString().slice(0, 10)),
      lte(availabilityExceptions.exceptionDate, windowEnd.toISOString().slice(0, 10)),
    )),
    db.select({
      staffId: assignments.staffId,
      shiftId: shifts.id,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      status: assignments.status,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(and(
        inArray(assignments.staffId, staffIds),
        eq(assignments.status, "assigned"),
        eq(shifts.status, "active"),
        gte(shifts.endsAt, windowStart),
        lte(shifts.startsAt, windowEnd),
      )),
    db.select({ value: count() }).from(assignments).where(and(
      eq(assignments.shiftId, shift.id),
      eq(assignments.status, "assigned"),
    )),
  ]);

  const skillsByStaff = groupByStaff(skillRows);
  const certificationsByStaff = groupByStaff(certificationRows);
  const rulesByStaff = groupByStaff(ruleRows);
  const exceptionsByStaff = groupByStaff(exceptionRows);
  const assignmentsByStaff = groupByStaff(existingRows);

  const candidates = staff.map((person) => ({
    staffId: person.staffId,
    name: `${person.firstName} ${person.lastName}`,
    ...evaluateAssignment({
      candidateStaff: {
        id: person.staffId,
        primaryTimezone: person.primaryTimezone,
        skills: skillsByStaff.get(person.staffId) ?? [],
        certifications: certificationsByStaff.get(person.staffId) ?? [],
        availabilityRules: rulesByStaff.get(person.staffId) ?? [],
        availabilityExceptions: exceptionsByStaff.get(person.staffId) ?? [],
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
      existingAssignments: assignmentsByStaff.get(person.staffId) ?? [],
      activeAssignmentCount: headcount?.value ?? 0,
    }),
  }));
  candidates.sort((a, b) => {
    const rank = (candidate: typeof a) => candidate.blockers.length ? 2 : candidate.warnings.length ? 1 : 0;
    return rank(a) - rank(b) || a.impact.projectedWeeklyHours - b.impact.projectedWeeklyHours || a.name.localeCompare(b.name);
  });
  return {
    shift: {
      id: shift.id,
      skillName: shift.skillName,
      timezone: shift.timezone,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      emergencyCoverageRequired: shift.weekStatus === "published" && shift.startsAt.getTime() - Date.now() < shift.cutoffMinutes * 60_000,
    },
    candidates,
  };
}
