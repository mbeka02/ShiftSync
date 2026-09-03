import { describe, expect, it } from "vitest";

describe("Manager shift management", () => {
  it("creates a timezone-correct shift with audit and realtime records", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { assignManagerToLocation, createTestLocation, createTestSkill } = await import("@/tests/helpers/data");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { createShift } = await import("@/server/scheduling/lifecycle");
    const { db } = await import("@/server/db");
    const { auditLogs, outboxEvents, shifts } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");

    const manager = await createTestUser("manager", { firstName: "Alex", lastName: "Rivera" });
    const actor = await getAuthenticatedUser(manager.headers);
    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(manager.userId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });

    const result = await createShift({
      locationId,
      weekStartDate: "2026-09-14",
      requiredSkillId: skillId,
      startsLocal: "2026-09-14T09:00",
      endsLocal: "2026-09-14T17:00",
      headcount: 2,
      premium: false,
    }, actor!);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, result.shiftId));
    expect(shift.startsAt.toISOString()).toBe("2026-09-14T13:00:00.000Z");
    expect(shift.localStartDate).toBe("2026-09-14");
    expect(shift.localStartTime).toBe("09:00:00");
    expect(shift.headcount).toBe(2);

    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.entityType, "shift"),
      eq(auditLogs.entityId, result.shiftId),
    ));
    expect(audit?.action).toBe("SHIFT_CREATED");
    const [event] = await db.select().from(outboxEvents).where(and(
      eq(outboxEvents.event, "shift.created"),
      eq(outboxEvents.channel, `private-location-${locationId}`),
    ));
    expect(event).toBeDefined();
  });
});
