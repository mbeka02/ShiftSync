import { describe, it, expect } from "vitest";

/**
 * Slice 3 — Notifications, At-Risk Flags, and Outbox Events
 *
 * Seams:
 *   getUserNotifications(actor) -> Notification[]
 *   markNotificationRead(notificationId, actor) -> { success: boolean }
 *   flagAtRiskAssignments(staffId, changeType) -> { flaggedCount: number }
 *
 * Capability:
 *   - Notification service retrieves notifications for an authenticated user and allows marking them read.
 *   - When staff availability or certification changes, future assignments that fall outside the new availability
 *     are NOT silently deleted. They are retained and flagged AT_RISK_AVAILABILITY or AT_RISK_CERTIFICATION in risk_flags.
 *   - Persisted manager notifications are automatically generated for affected location managers.
 *   - Outbox events are written during state-changing operations inside the DB transaction.
 *
 * Design-spec reference: §3.6 Location Certifications, §3.7 Availability Model, §2.7 Realtime Architecture.
 * Test layer: PostgreSQL integration.
 */

describe("Notifications, At-Risk Flags, and Outbox Events", () => {
  it("getUserNotifications returns notifications and markNotificationRead updates state", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { getNotifications, markNotificationRead } = await import("@/server/notifications/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { notifications } = await import("@/server/db/schema");

    const { headers, userId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
    });

    // Seed a notification
    const [inserted] = await db
      .insert(notifications)
      .values({
        userId,
        type: "SCHEDULE_PUBLISHED",
        title: "Schedule Published",
        message: "Your schedule for next week has been published.",
      })
      .returning({ id: notifications.id });

    const actor = await getAuthenticatedUser(headers);
    const list = await getNotifications(actor!);

    expect(list.length).toBeGreaterThan(0);
    expect(list[0].id).toBe(inserted.id);
    expect(list[0].read).toBe(false);

    const markResult = await markNotificationRead(inserted.id, actor!);
    expect(markResult.success).toBe(true);

    const updatedList = await getNotifications(actor!);
    expect(updatedList.find((item) => item.id === inserted.id)?.read).toBe(true);
  });

  it("availability change flags future assignments AT_RISK_AVAILABILITY and notifies managers", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { createStaffSkill, createStaffCertification, createAvailabilityRule } =
      await import("@/tests/helpers/scheduling");
    const { updateStaffAvailability } = await import("@/server/scheduling/availability");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, notifications } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { headers: staffHeaders, userId: staffId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffId, skillId);
    await createStaffCertification(staffId, locationId);

    // Initial availability: Mon 09:00 - 17:00 ET
    await createAvailabilityRule(staffId, {
      weekday: 1,
      startLocalTime: "09:00",
      endLocalTime: "17:00",
      timezone: "America/New_York",
    });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");
    const futureShiftStart = new Date("2026-09-14T14:00:00Z"); // Mon 10 AM ET
    const futureShiftEnd = new Date("2026-09-14T22:00:00Z");   // Mon 6 PM ET

    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: futureShiftStart,
      endsAt: futureShiftEnd,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const assignmentId = await createAssignment(shiftId, staffId, managerId);

    const staffActor = await getAuthenticatedUser(staffHeaders);

    // Staff changes availability to Mon 09:00 - 12:00 (making the 10 AM - 6 PM shift out of bounds)
    await updateStaffAvailability(
      staffId,
      [
        {
          weekday: 1,
          startLocalTime: "09:00",
          endLocalTime: "12:00",
          timezone: "America/New_York",
        },
      ],
      staffActor!
    );

    // 1. Verify assignment was NOT deleted, but retains status 'assigned' with riskFlag AT_RISK_AVAILABILITY
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(assignment).toBeDefined();
    expect(assignment.status).toBe("assigned");
    expect(assignment.riskFlags).toContain("AT_RISK_AVAILABILITY");

    // 2. Verify manager received a notification
    const mgrNotifications = await db.select().from(notifications).where(eq(notifications.userId, managerId));
    expect(mgrNotifications.length).toBeGreaterThan(0);
    expect(mgrNotifications[0].type).toBe("ASSIGNMENT_AT_RISK");
  });
});
