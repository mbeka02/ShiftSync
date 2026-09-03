import { describe, it, expect } from "vitest";

/**
 * Slice 5 — Outbox Event Drain & Delivery
 *
 * Seam: drainOutboxEvents(options?: { limit?: number }) -> { processedCount: number, deliveredCount: number, failedCount: number }
 *
 * Requirements:
 *   - Reads pending outbox_events in order of creation.
 *   - Attempts delivery via Pusher transport (mocked or fallback gracefully in test).
 *   - Updates event status to 'delivered' with deliveredAt timestamp upon success.
 *   - Idempotency: Processing delivered events does nothing.
 *
 * Test layer: PostgreSQL integration.
 */

describe("Outbox event drain & delivery", () => {
  it("drains pending outbox events and marks them delivered", async () => {
    const { db } = await import("@/server/db");
    const { outboxEvents } = await import("@/server/db/schema");
    const { drainOutboxEvents } = await import("@/server/outbox/service");
    const { eq } = await import("drizzle-orm");
    const { randomUUID } = await import("node:crypto");

    const eventId = randomUUID();
    await db.insert(outboxEvents).values({
      id: eventId,
      channel: "private-user-test-123",
      event: "schedule.updated",
      payload: { test: true },
      status: "pending",
    });

    const result = await drainOutboxEvents({ limit: 10 });
    expect(result.processedCount).toBeGreaterThanOrEqual(1);

    const [updated] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, eventId));
    expect(updated.status).toBe("delivered");
    expect(updated.deliveredAt).not.toBeNull();
  });

  it("is idempotent when running drain repeatedly on empty or delivered events", async () => {
    const { drainOutboxEvents } = await import("@/server/outbox/service");

    const result1 = await drainOutboxEvents({ limit: 10 });
    const result2 = await drainOutboxEvents({ limit: 10 });

    expect(result2.processedCount).toBe(0);
    expect(result2.deliveredCount).toBe(0);
  });
});
