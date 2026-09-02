import { describe, it, expect } from "vitest";

/**
 * Slice 3 — Schedule Week Publication & Cutoff Enforcement
 *
 * Seam:
 *   publishScheduleWeek(weekId, actor) -> { success: boolean, weekId: string }
 *   unpublishScheduleWeek(weekId, actor) -> { success: boolean, weekId: string } | { success: false, blockers: ConstraintViolation[] }
 *   updateShift(command, actor) -> { success: boolean, shiftId: string } | { success: false, blockers: ConstraintViolation[] }
 *
 * Capability:
 *   - Managers can publish and unpublish schedule weeks for locations they manage.
 *   - Publishing marks status = 'published', sets publishedAt + publishedBy, and increments version.
 *   - Unpublishing a week is rejected if any active shift in that week has entered its cutoff window (default 48h before start).
 *   - Structural shift edits (time, headcount, location) on published shifts inside the cutoff window are rejected with SCHEDULE_CUTOFF_REACHED.
 *   - Structural shift edits outside the cutoff window succeed.
 *
 * Design-spec reference: §3.8 Schedule Weeks and Publication, Cutoff behavior.
 * Test layer: PostgreSQL integration.
 */

describe("Schedule lifecycle and cutoff enforcement", () => {
  // ─── Publish Schedule Week ────────────────────────────────────────

  it("manager can publish a draft schedule week for an authorized location", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
    } = await import("@/tests/helpers/data");
    const { publishScheduleWeek } = await import("@/server/scheduling/lifecycle");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { scheduleWeeks } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");

    const actor = await getAuthenticatedUser(managerHeaders);
    const result = await publishScheduleWeek(weekId, actor!);

    expect(result.success).toBe(true);

    const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, weekId));
    expect(week.status).toBe("published");
    expect(week.publishedBy).toBe(managerId);
    expect(week.publishedAt).not.toBeNull();
  });

  // ─── Unpublish Outside Cutoff ─────────────────────────────────────

  it("manager can unpublish a published schedule week when all shifts are outside cutoff", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { publishScheduleWeek, unpublishScheduleWeek } = await import("@/server/scheduling/lifecycle");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { scheduleWeeks } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");
    // Shift far in the future (outside 48h cutoff)
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date(futureDate.getTime() + 8 * 60 * 60 * 1000);
    await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: futureDate,
      endsAt: endDate,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await publishScheduleWeek(weekId, actor!);
    const result = await unpublishScheduleWeek(weekId, actor!);

    expect(result.success).toBe(true);

    const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, weekId));
    expect(week.status).toBe("draft");
  });

  // ─── Unpublish Blocked Inside Cutoff ──────────────────────────────

  it("rejects unpublishing a schedule week if any active shift is inside the cutoff window", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { publishScheduleWeek, unpublishScheduleWeek } = await import("@/server/scheduling/lifecycle");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");
    // Shift starts in 12 hours (inside 48h / 2880 min cutoff)
    const nearDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const endDate = new Date(nearDate.getTime() + 8 * 60 * 60 * 1000);
    await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: nearDate,
      endsAt: endDate,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await publishScheduleWeek(weekId, actor!);
    const result = await unpublishScheduleWeek(weekId, actor!);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.blockers).toContainEqual(
        expect.objectContaining({ code: "SCHEDULE_CUTOFF_REACHED" })
      );
    }
  });

  // ─── Structural Edit Blocked Inside Cutoff ────────────────────────

  it("blocks structural shift edits on a published shift inside the cutoff window", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { publishScheduleWeek, updateShift } = await import("@/server/scheduling/lifecycle");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");
    // Shift starts in 2 hours (inside cutoff)
    const nearStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const nearEnd = new Date(nearStart.getTime() + 8 * 60 * 60 * 1000);
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: nearStart,
      endsAt: nearEnd,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await publishScheduleWeek(weekId, actor!);

    // Attempt structural edit (changing headcount)
    const result = await updateShift(
      {
        shiftId,
        headcount: 3, // structural change
      },
      actor!
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.blockers).toContainEqual(
        expect.objectContaining({ code: "SCHEDULE_CUTOFF_REACHED" })
      );
    }
  });
});
