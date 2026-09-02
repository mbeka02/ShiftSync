import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  coverageRequests,
  locations,
  shifts,
  skills,
  staffLocationCertifications,
  staffProfiles,
  staffSkills,
  userProfiles,
} from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";
import { canManageLocation } from "@/server/scheduling/assignment";

const pendingStatuses = ["open", "pending_target", "accepted_by_target", "claimed"] as const;

const requestSelection = {
  id: coverageRequests.id,
  shiftId: coverageRequests.shiftId,
  requesterStaffId: coverageRequests.requesterStaffId,
  targetStaffId: coverageRequests.targetStaffId,
  claimantStaffId: coverageRequests.claimantStaffId,
  type: coverageRequests.type,
  status: coverageRequests.status,
  reason: coverageRequests.reason,
  expiresAt: coverageRequests.expiresAt,
  createdAt: coverageRequests.createdAt,
  startsAt: shifts.startsAt,
  endsAt: shifts.endsAt,
  timezone: shifts.timezone,
  locationName: locations.name,
  skillName: skills.name,
};

type RequestRow = Awaited<ReturnType<typeof requestRowsForStaff>>[number];

async function requestRowsForStaff(actorId: string) {
  return db.select(requestSelection).from(coverageRequests)
    .innerJoin(shifts, eq(coverageRequests.shiftId, shifts.id))
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
    .where(and(
      inArray(coverageRequests.status, pendingStatuses),
      or(
        eq(coverageRequests.requesterStaffId, actorId),
        eq(coverageRequests.targetStaffId, actorId),
        eq(coverageRequests.claimantStaffId, actorId),
      ),
    ))
    .orderBy(desc(coverageRequests.createdAt));
}

async function decorate(rows: RequestRow[], actorId: string) {
  const userIds = [...new Set(rows.flatMap((row) => [row.requesterStaffId, row.targetStaffId, row.claimantStaffId]).filter((id): id is string => Boolean(id)))];
  const profiles = userIds.length
    ? await db.select({ id: userProfiles.userId, firstName: userProfiles.firstName, lastName: userProfiles.lastName })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, userIds))
    : [];
  const names = new Map(profiles.map((profile) => [profile.id, `${profile.firstName} ${profile.lastName}`]));
  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    requesterName: names.get(row.requesterStaffId) ?? "Staff member",
    targetName: row.targetStaffId ? names.get(row.targetStaffId) ?? "Staff member" : null,
    claimantName: row.claimantStaffId ? names.get(row.claimantStaffId) ?? "Staff member" : null,
    isRequester: row.requesterStaffId === actorId,
    isTarget: row.targetStaffId === actorId,
    isClaimant: row.claimantStaffId === actorId,
  }));
}

export async function getStaffCoverageQueue(actor: EnrichedSession) {
  const actorId = actor.session.user.id;
  const related = await requestRowsForStaff(actorId);
  const openDrops = await db.select(requestSelection).from(coverageRequests)
    .innerJoin(shifts, eq(coverageRequests.shiftId, shifts.id))
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
    .innerJoin(staffSkills, and(
      eq(staffSkills.staffId, actorId),
      eq(staffSkills.skillId, shifts.requiredSkillId),
      lte(staffSkills.validFrom, shifts.localStartDate),
      or(isNull(staffSkills.validTo), lte(shifts.localStartDate, staffSkills.validTo)),
    ))
    .innerJoin(staffLocationCertifications, and(
      eq(staffLocationCertifications.staffId, actorId),
      eq(staffLocationCertifications.locationId, shifts.locationId),
      eq(staffLocationCertifications.status, "active"),
      lte(staffLocationCertifications.validFrom, shifts.localStartDate),
      or(isNull(staffLocationCertifications.validTo), lte(shifts.localStartDate, staffLocationCertifications.validTo)),
    ))
    .where(and(
      eq(coverageRequests.type, "drop"),
      eq(coverageRequests.status, "open"),
      ne(coverageRequests.requesterStaffId, actorId),
      gt(coverageRequests.expiresAt, new Date()),
    ))
    .orderBy(asc(shifts.startsAt));
  const unique = new Map([...related, ...openDrops].map((row) => [row.id, row]));
  return decorate([...unique.values()], actorId);
}

export async function getManagerCoverageQueue(locationId: string, actor: EnrichedSession) {
  if (!(await canManageLocation(db, actor, locationId))) return [];
  const rows = await db.select(requestSelection).from(coverageRequests)
    .innerJoin(shifts, eq(coverageRequests.shiftId, shifts.id))
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .innerJoin(skills, eq(shifts.requiredSkillId, skills.id))
    .where(and(
      eq(shifts.locationId, locationId),
      inArray(coverageRequests.status, pendingStatuses),
    ))
    .orderBy(asc(shifts.startsAt));
  return decorate(rows, actor.session.user.id);
}

export async function getSwapTargetsForShifts(shiftIds: string[], actor: EnrichedSession) {
  if (!shiftIds.length) return {} as Record<string, Array<{ staffId: string; name: string }>>;
  const ownedShifts = await db.select({
    id: shifts.id,
    requiredSkillId: shifts.requiredSkillId,
    locationId: shifts.locationId,
    localStartDate: shifts.localStartDate,
  }).from(shifts).where(inArray(shifts.id, shiftIds));
  const skillIds = [...new Set(ownedShifts.map((shift) => shift.requiredSkillId))];
  const locationIds = [...new Set(ownedShifts.map((shift) => shift.locationId))];
  const candidates = await db.select({
    staffId: staffProfiles.userId,
    firstName: userProfiles.firstName,
    lastName: userProfiles.lastName,
    skillId: staffSkills.skillId,
    skillValidFrom: staffSkills.validFrom,
    skillValidTo: staffSkills.validTo,
    locationId: staffLocationCertifications.locationId,
    certificationValidFrom: staffLocationCertifications.validFrom,
    certificationValidTo: staffLocationCertifications.validTo,
    certificationStatus: staffLocationCertifications.status,
  }).from(staffProfiles)
    .innerJoin(userProfiles, eq(staffProfiles.userId, userProfiles.userId))
    .innerJoin(staffSkills, eq(staffProfiles.userId, staffSkills.staffId))
    .innerJoin(staffLocationCertifications, eq(staffProfiles.userId, staffLocationCertifications.staffId))
    .where(and(
      ne(staffProfiles.userId, actor.session.user.id),
      eq(userProfiles.status, "active"),
      inArray(staffSkills.skillId, skillIds),
      inArray(staffLocationCertifications.locationId, locationIds),
    ));

  return Object.fromEntries(ownedShifts.map((shift) => {
    const targets = candidates.filter((candidate) =>
      candidate.skillId === shift.requiredSkillId
      && candidate.locationId === shift.locationId
      && candidate.skillValidFrom <= shift.localStartDate
      && (candidate.skillValidTo === null || candidate.skillValidTo >= shift.localStartDate)
      && candidate.certificationStatus === "active"
      && candidate.certificationValidFrom <= shift.localStartDate
      && (candidate.certificationValidTo === null || candidate.certificationValidTo >= shift.localStartDate));
    const unique = new Map(targets.map((candidate) => [candidate.staffId, {
      staffId: candidate.staffId,
      name: `${candidate.firstName} ${candidate.lastName}`,
    }]));
    return [shift.id, [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))];
  }));
}
