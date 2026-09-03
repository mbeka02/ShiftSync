import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { outboxEvents } from "@/server/db/schema";
import { hasPusherCredentials, publishEvent } from "@/server/realtime/publisher";

type DrainOptions = { limit?: number };

async function deliver(channel: string, event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" || !hasPusherCredentials()) return;
  await publishEvent(channel, event, payload);
}

export async function drainOutboxEvents(options: DrainOptions = {}) {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 25), 1), 100);
  const candidates = await db.select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(eq(outboxEvents.status, "pending"))
    .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
    .limit(limit);

  let processedCount = 0;
  let deliveredCount = 0;
  let failedCount = 0;

  for (const candidate of candidates) {
    const outcome = await deliverOutboxEvent(candidate.id);
    if (outcome === "skipped") continue;
    processedCount += 1;
    if (outcome === "delivered") deliveredCount += 1;
    else failedCount += 1;
  }

  return { processedCount, deliveredCount, failedCount };
}

export async function deliverOutboxEvent(eventId: string) {
  return db.transaction(async (tx) => {
    const lock = await tx.execute<{ id: string }>(sql`
      select id from outbox_events
      where id = ${eventId} and status = 'pending'
      for update skip locked
    `);
    if (!lock.rows.length) return "skipped" as const;
    const [event] = await tx.select().from(outboxEvents).where(eq(outboxEvents.id, eventId)).limit(1);
    if (!event || event.status !== "pending") return "skipped" as const;
    try {
      await deliver(event.channel, event.event, event.payload);
      await tx.update(outboxEvents).set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(outboxEvents.id, event.id));
      return "delivered" as const;
    } catch {
      return "failed" as const;
    }
  });
}
