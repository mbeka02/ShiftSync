import { describe, it, expect } from "vitest";

/**
 * Slice 1 — Staff Published Schedule Read Boundary
 *
 * Seam: getMySchedule(weekStart, actor) -> StaffScheduleView
 *
 * Capability: Staff can read their own assigned shifts, but only
 * from published schedule weeks. Draft weeks are never exposed.
 * Shift times include the location's timezone label.
 *
 * Observable behavior:
 *   - Staff sees shifts from published schedule weeks they are assigned to.
 *   - Staff does NOT see shifts from draft schedule weeks.
 *   - Each shift in the result includes the location timezone label.
 *   - Staff cannot see shifts assigned to other staff members.
 *
 * Design-spec reference: §3.8 schedule_weeks.status is the sole
 * publication source of truth. §3.3 Staff -> "own profile/availability/
 * assignments plus published shifts relevant to them".
 *
 * Test layer: PostgreSQL integration (real schema, real queries).
 */

describe("Staff published schedule read boundary", () => {
  it("staff sees their shifts from published weeks only", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { getMySchedule } = await import("@/server/scheduling/queries");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    // Setup: one staff member, one location, two schedule weeks
    const { headers: staffHeaders, userId: staffId } = await createTestUser(
      "staff",
      {
        firstName: "Maria",
        lastName: "Chen",
        primaryTimezone: "America/New_York",
      }
    );
    const { userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });

    const locationId = await createTestLocation({
      name: "Harbor East",
      timezone: "America/New_York",
    });
    const skillId = await createTestSkill({ code: "bartender", name: "Bartender" });

    // Published week — staff should see this
    const publishedWeekId = await createScheduleWeek(
      locationId,
      "2025-09-01",
      "published"
    );
    const publishedShiftId = await createShift({
      scheduleWeekId: publishedWeekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T21:00:00Z"), // 5 PM ET
      endsAt: new Date("2025-09-02T03:00:00Z"), // 11 PM ET
      timezone: "America/New_York",
    });
    await createAssignment(publishedShiftId, staffId, managerId);

    // Draft week — staff should NOT see this
    const draftWeekId = await createScheduleWeek(
      locationId,
      "2025-09-08",
      "draft"
    );
    const draftShiftId = await createShift({
      scheduleWeekId: draftWeekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-08T21:00:00Z"),
      endsAt: new Date("2025-09-09T03:00:00Z"),
      timezone: "America/New_York",
    });
    await createAssignment(draftShiftId, staffId, managerId);

    // Act: staff reads their schedule for the published week
    const actor = await getAuthenticatedUser(staffHeaders);
    const result = await getMySchedule("2025-09-01", actor!);

    // Should see exactly 1 shift from the published week
    expect(result.shifts).toHaveLength(1);
    expect(result.shifts[0].shiftId).toBe(publishedShiftId);

    // Each shift must include the location timezone
    expect(result.shifts[0].locationTimezone).toBe("America/New_York");
  });

  it("staff cannot see shifts assigned to other staff", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { getMySchedule } = await import("@/server/scheduling/queries");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    // Two staff members
    const { headers: staff1Headers } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });
    const { userId: staff2Id } = await createTestUser("staff", {
      firstName: "John",
      lastName: "Rivera",
      primaryTimezone: "America/New_York",
    });
    const { userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });

    const locationId = await createTestLocation({
      name: "Harbor North",
      timezone: "America/New_York",
    });
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    const weekId = await createScheduleWeek(
      locationId,
      "2025-09-01",
      "published"
    );
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T13:00:00Z"),
      endsAt: new Date("2025-09-01T21:00:00Z"),
      timezone: "America/New_York",
    });

    // Assign to staff2, NOT staff1
    await createAssignment(shiftId, staff2Id, managerId);

    // Staff1 should see zero shifts
    const actor = await getAuthenticatedUser(staff1Headers);
    const result = await getMySchedule("2025-09-01", actor!);

    expect(result.shifts).toHaveLength(0);
  });
});
