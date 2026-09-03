import { eq } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  auditLogs,
  notificationPreferences,
  type NotificationMode,
} from "@/server/db/schema";

const DEFAULT_NOTIFICATION_MODE: NotificationMode = "in_app_only";
const MODES = new Set<NotificationMode>(["in_app_only", "in_app_and_email"]);

export async function getNotificationPreferences(actor: EnrichedSession) {
  const [preferences] = await db.select({ notificationMode: notificationPreferences.notificationMode })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, actor.session.user.id))
    .limit(1);
  return { notificationMode: preferences?.notificationMode ?? DEFAULT_NOTIFICATION_MODE };
}

export async function updateNotificationPreferences(
  input: { notificationMode: NotificationMode },
  actor: EnrichedSession,
) {
  if (!MODES.has(input.notificationMode)) {
    return { success: false as const, code: "INVALID_NOTIFICATION_MODE" as const };
  }
  const previous = await getNotificationPreferences(actor);
  await db.transaction(async (tx) => {
    await tx.insert(notificationPreferences).values({
      userId: actor.session.user.id,
      notificationMode: input.notificationMode,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { notificationMode: input.notificationMode, updatedAt: new Date() },
    });
    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      action: "UPDATE_NOTIFICATION_PREFERENCES",
      entityType: "notification_preferences",
      entityId: actor.session.user.id,
      beforeState: previous,
      afterState: { notificationMode: input.notificationMode },
    });
  });
  return { success: true as const, notificationMode: input.notificationMode };
}

export async function shouldDispatchSimulatedEmail(userId: string) {
  const [preferences] = await db.select({ notificationMode: notificationPreferences.notificationMode })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return preferences?.notificationMode === "in_app_and_email";
}
