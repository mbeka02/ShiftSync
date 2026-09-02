"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/session";
import { markNotificationRead } from "@/server/notifications/service";

export async function markNotificationReadAction(notificationId: string) {
  const parsed = z.uuid().safeParse(notificationId);
  if (!parsed.success) return { success: false as const };
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) return { success: false as const };
  return markNotificationRead(parsed.data, actor);
}
