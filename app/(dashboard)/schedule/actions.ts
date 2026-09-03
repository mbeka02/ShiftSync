"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { locations, shifts } from "@/server/db/schema";
import { assignStaff } from "@/server/scheduling/assignment";
import { getAssignmentCandidates } from "@/server/scheduling/candidates";
import { assignEmergencyCoverage } from "@/server/scheduling/emergency";
import { createShift, publishScheduleWeek, unpublishScheduleWeek, updateShift } from "@/server/scheduling/lifecycle";
import { deliverOutboxEvent } from "@/server/outbox/service";
import { localDateTimeToInstant } from "@/server/scheduling/time";

const commandSchema = z.object({
  shiftId: z.uuid(),
  staffId: z.string().min(1),
  managerOverride: z.boolean().optional(),
  overrideReason: z.string().trim().max(500).optional(),
}).refine((value) => !value.managerOverride || Boolean(value.overrideReason), {
  message: "A documented reason is required for a manager override.",
  path: ["overrideReason"],
});
const shiftIdSchema = z.uuid();
const emergencyCommandSchema = commandSchema.extend({ reason: z.string().trim().min(1) });
const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const createShiftSchema = z.object({
  locationId: z.uuid(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requiredSkillId: z.uuid(),
  startsLocal: localDateTimeSchema,
  endsLocal: localDateTimeSchema,
  headcount: z.number().int().min(1).max(50),
  premium: z.boolean(),
});
const updateShiftSchema = z.object({
  shiftId: z.uuid(),
  requiredSkillId: z.uuid(),
  startsLocal: localDateTimeSchema,
  endsLocal: localDateTimeSchema,
  headcount: z.number().int().min(1).max(50),
  premium: z.boolean(),
});

export async function loadAssignmentCandidatesAction(shiftId: string) {
  const parsed = shiftIdSchema.safeParse(shiftId);
  if (!parsed.success) return { success: false as const, error: "This shift is no longer available." };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, error: "Your session has ended. Sign in and try again." };
  const data = await getAssignmentCandidates(parsed.data, actor);
  if (!data) return { success: false as const, error: "This shift is unavailable or outside your location access." };
  return { success: true as const, data };
}

async function deliverEvents(result: unknown) {
  if (typeof result !== "object" || result === null || !("eventIds" in result) || !Array.isArray(result.eventIds)) return;
  await Promise.allSettled(result.eventIds.map((eventId) => deliverOutboxEvent(String(eventId))));
}

export async function assignStaffAction(command: { shiftId: string; staffId: string; managerOverride?: boolean; overrideReason?: string }) {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "INVALID_ASSIGNMENT", severity: "BLOCK" as const, message: "The selected shift or staff member is invalid.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = await assignStaff(parsed.data, actor);
  await deliverEvents(result);
  if (result.success) revalidatePath("/schedule");
  return result;
}

export async function assignEmergencyCoverageAction(command: { shiftId: string; staffId: string; reason: string }) {
  const parsed = emergencyCommandSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "EMERGENCY_REASON_REQUIRED", severity: "BLOCK" as const, message: "A documented reason is required for emergency coverage.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = await assignEmergencyCoverage(parsed.data, actor);
  await deliverEvents(result);
  if (result.success) revalidatePath("/schedule");
  return result;
}

export async function createShiftAction(command: z.infer<typeof createShiftSchema>) {
  const parsed = createShiftSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "INVALID_SHIFT_STRUCTURE", severity: "BLOCK" as const, message: "Check the shift date, times, skill, and headcount.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = await createShift(parsed.data, actor);
  await deliverEvents(result);
  if (result.success) revalidatePath("/schedule");
  return result;
}

export async function updateShiftAction(command: z.infer<typeof updateShiftSchema>) {
  const parsed = updateShiftSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "INVALID_SHIFT_STRUCTURE", severity: "BLOCK" as const, message: "Check the shift date, times, skill, and headcount.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const [record] = await db.select({ timezone: locations.timezone }).from(shifts)
    .innerJoin(locations, eq(shifts.locationId, locations.id))
    .where(eq(shifts.id, parsed.data.shiftId))
    .limit(1);
  if (!record) return { success: false as const, blockers: [{ code: "SCHEDULE_TARGET_NOT_FOUND", severity: "BLOCK" as const, message: "This shift no longer exists.", details: {} }] };
  let startsAt: Date;
  let endsAt: Date;
  try {
    startsAt = localDateTimeToInstant(parsed.data.startsLocal, record.timezone);
    endsAt = localDateTimeToInstant(parsed.data.endsLocal, record.timezone);
  } catch (error) {
    return { success: false as const, blockers: [{ code: "INVALID_LOCAL_TIME", severity: "BLOCK" as const, message: error instanceof Error ? error.message : "The local shift time is invalid.", details: {} }] };
  }
  const result = await updateShift({
    shiftId: parsed.data.shiftId,
    startsAt,
    endsAt,
    requiredSkillId: parsed.data.requiredSkillId,
    headcount: parsed.data.headcount,
    premium: parsed.data.premium,
  }, actor);
  await deliverEvents(result);
  if (result.success) revalidatePath("/schedule");
  return result;
}

export async function changeSchedulePublicationAction(command: { weekId: string; target: "published" | "draft" }) {
  const parsed = z.object({ weekId: z.uuid(), target: z.enum(["published", "draft"]) }).safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "INVALID_SCHEDULE_WEEK", severity: "BLOCK" as const, message: "This schedule week is no longer available.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = parsed.data.target === "published"
    ? await publishScheduleWeek(parsed.data.weekId, actor)
    : await unpublishScheduleWeek(parsed.data.weekId, actor);
  await deliverEvents(result);
  if (result.success) revalidatePath("/schedule");
  return result;
}
