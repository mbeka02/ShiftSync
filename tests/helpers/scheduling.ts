import { db } from "@/server/db";
import {
  availabilityRules,
  staffLocationCertifications,
  staffSkills,
} from "@/server/db/schema";

export async function createStaffSkill(
  staffId: string,
  skillId: string,
  options: { validFrom?: string; validTo?: string | null } = {},
) {
  await db.insert(staffSkills).values({
    staffId,
    skillId,
    validFrom: options.validFrom ?? "2025-01-01",
    validTo: options.validTo ?? null,
  });
}

export async function createStaffCertification(
  staffId: string,
  locationId: string,
  options: { validFrom?: string; validTo?: string | null; status?: "active" | "suspended" | "revoked" } = {},
) {
  await db.insert(staffLocationCertifications).values({
    staffId,
    locationId,
    validFrom: options.validFrom ?? "2025-01-01",
    validTo: options.validTo ?? null,
    status: options.status ?? "active",
  });
}

export async function createAvailabilityRule(
  staffId: string,
  data: {
    weekday: number;
    startLocalTime: string;
    endLocalTime: string;
    timezone: string;
    validFrom?: string;
    validTo?: string | null;
    active?: boolean;
  },
) {
  const [rule] = await db.insert(availabilityRules).values({
    staffId,
    weekday: data.weekday,
    startLocalTime: data.startLocalTime,
    endLocalTime: data.endLocalTime,
    timezone: data.timezone,
    validFrom: data.validFrom ?? "2025-01-01",
    validTo: data.validTo ?? null,
    active: data.active ?? true,
  }).returning({ id: availabilityRules.id });
  return rule.id;
}
