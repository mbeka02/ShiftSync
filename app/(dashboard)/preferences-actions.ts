"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/session";
import { updateNotificationPreferences } from "@/server/preferences/service";

const modeSchema = z.enum(["in_app_only", "in_app_and_email"]);

export async function updateNotificationPreferenceAction(mode: string) {
  const parsed = modeSchema.safeParse(mode);
  if (!parsed.success) return { success: false as const, code: "INVALID_NOTIFICATION_MODE" as const };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const, code: "UNAUTHORIZED" as const };
  const result = await updateNotificationPreferences({ notificationMode: parsed.data }, actor);
  if (result.success) revalidatePath("/", "layout");
  return result;
}
