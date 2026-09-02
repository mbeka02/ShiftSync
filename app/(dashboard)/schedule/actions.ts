"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/session";
import { assignStaff } from "@/server/scheduling/assignment";
import { getAssignmentCandidates } from "@/server/scheduling/candidates";
import { assignEmergencyCoverage } from "@/server/scheduling/emergency";
import { publishScheduleWeek, unpublishScheduleWeek } from "@/server/scheduling/lifecycle";

const commandSchema = z.object({ shiftId: z.uuid(), staffId: z.string().min(1) });
const shiftIdSchema = z.uuid();
const emergencyCommandSchema = commandSchema.extend({ reason: z.string().trim().min(1) });

export async function loadAssignmentCandidatesAction(shiftId: string) {
  const parsed = shiftIdSchema.safeParse(shiftId);
  if (!parsed.success) return { success: false as const, error: "This shift is no longer available." };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, error: "Your session has ended. Sign in and try again." };
  const data = await getAssignmentCandidates(parsed.data, actor);
  if (!data) return { success: false as const, error: "This shift is unavailable or outside your location access." };
  return { success: true as const, data };
}

export async function assignStaffAction(command: { shiftId: string; staffId: string }) {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "INVALID_ASSIGNMENT", severity: "BLOCK" as const, message: "The selected shift or staff member is invalid.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = await assignStaff(parsed.data, actor);
  if (result.success) revalidatePath("/schedule");
  return result;
}

export async function assignEmergencyCoverageAction(command: { shiftId: string; staffId: string; reason: string }) {
  const parsed = emergencyCommandSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "EMERGENCY_REASON_REQUIRED", severity: "BLOCK" as const, message: "A documented reason is required for emergency coverage.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = await assignEmergencyCoverage(parsed.data, actor);
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
  if (result.success) revalidatePath("/schedule");
  return result;
}
