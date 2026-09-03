import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { notificationPreferences, notifications, outboxEvents } from "@/server/db/schema";
import type { EnrichedSession } from "@/server/auth/session";

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
};

export async function dispatchNotifications(client: typeof db, inputs: NotificationInput[]) {
  if (!inputs.length) return { notifications: [], simulatedEmailCount: 0 };
  const userIds = [...new Set(inputs.map((input) => input.userId))];
  const preferences = await client.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds));
  const emailUsers = new Set(preferences.filter((item) => item.notificationMode === "in_app_and_email").map((item) => item.userId));
  const inserted = await client.insert(notifications).values(inputs).returning();
  const emailEvents = inserted.filter((notification) => emailUsers.has(notification.userId)).map((notification) => ({
    channel: `private-user-${notification.userId}`,
    event: "notification.email_simulated",
    payload: {
      notificationId: notification.id,
      userId: notification.userId,
      subject: notification.title,
      message: notification.message,
      simulated: true,
    },
  }));
  if (emailEvents.length) await client.insert(outboxEvents).values(emailEvents);
  return { notifications: inserted, simulatedEmailCount: emailEvents.length };
}

/**
 * Canonical notification dispatch seam. In-app delivery is always persisted;
 * the email simulation is queued only for users who explicitly opted in.
 */
export async function dispatchNotification(input: NotificationInput) {
  return db.transaction(async (tx) => {
    const result = await dispatchNotifications(tx as unknown as typeof db, [input]);
    return { notification: result.notifications[0], simulatedEmailQueued: result.simulatedEmailCount === 1 };
  });
}

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
