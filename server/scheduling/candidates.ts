import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/server/db";
import { shifts, staffLocationCertifications, staffProfiles, userProfiles } from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { previewAssignment } from "./assignment";

export async function getAssignmentCandidates(shiftId: string, actor: EnrichedSession) {
  const [shift] = await db.select({
    id: shifts.id,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    timezone: shifts.timezone,
    locationId: shifts.locationId,
    localStartDate: shifts.localStartDate,
  }).from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.status, "active"))).limit(1);
  if (!shift) return null;

  const staff = await db.selectDistinct({
    staffId: staffProfiles.userId,
    firstName: userProfiles.firstName,
    lastName: userProfiles.lastName,
  }).from(staffProfiles)
    .innerJoin(userProfiles, eq(staffProfiles.userId, userProfiles.userId))
    .innerJoin(staffLocationCertifications, eq(staffProfiles.userId, staffLocationCertifications.staffId))
    .where(and(
      eq(userProfiles.status, "active"),
      eq(staffLocationCertifications.locationId, shift.locationId),
      eq(staffLocationCertifications.status, "active"),
      lte(staffLocationCertifications.validFrom, shift.localStartDate),
      or(isNull(staffLocationCertifications.validTo), gte(staffLocationCertifications.validTo, shift.localStartDate)),
    ));

  const candidates = await Promise.all(staff.map(async (person) => {
    const preview = await previewAssignment({ shiftId, staffId: person.staffId }, actor);
    return { ...person, name: `${person.firstName} ${person.lastName}`, ...preview };
  }));
  candidates.sort((a, b) => {
    const rank = (candidate: typeof a) => candidate.blockers.length ? 2 : candidate.warnings.length ? 1 : 0;
    return rank(a) - rank(b) || a.impact.projectedWeeklyHours - b.impact.projectedWeeklyHours || a.name.localeCompare(b.name);
  });
  return { shift: { id: shift.id, timezone: shift.timezone, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() }, candidates };
}
