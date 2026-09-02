"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/session";
import { assignStaff } from "@/server/scheduling/assignment";

const commandSchema = z.object({ shiftId: z.uuid(), staffId: z.string().min(1) });

export async function assignStaffAction(command: { shiftId: string; staffId: string }) {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) return { success: false as const, blockers: [{ code: "INVALID_ASSIGNMENT", severity: "BLOCK" as const, message: "The selected shift or staff member is invalid.", details: {} }] };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] };
  const result = await assignStaff(parsed.data, actor);
  if (result.success) revalidatePath("/schedule");
  return result;
}
