import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";

export async function getNotifications(actor: EnrichedSession) {
  return db.select().from(notifications)
    .where(eq(notifications.userId, actor.session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(notificationId: string, actor: EnrichedSession) {
  const rows = await db.update(notifications).set({ read: true }).where(and(
    eq(notifications.id, notificationId),
    eq(notifications.userId, actor.session.user.id),
  )).returning({ id: notifications.id });
  return { success: rows.length > 0 };
}
