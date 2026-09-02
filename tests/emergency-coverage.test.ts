import { describe, it, expect } from "vitest";

/**
 * Slice 3 — Audited Emergency Coverage (Sunday Night Chaos Scenario)
 *
 * Seam:
 *   assignEmergencyCoverage(command, actor) -> { success: true, assignmentId: string } | { success: false, blockers: ConstraintViolation[] }
 *
 * Capability:
 *   - Inside the cutoff window, a manager cannot perform a structural shift edit,
 *     but CAN assign or replace staff via Audited Emergency Coverage.
 *   - Command requires `shiftId`, `staffId`, and `reason` (non-empty string).
 *   - If `reason` is missing or blank → returns EMERGENCY_REASON_REQUIRED blocker.
 *   - Revalidates the replacement under normal transaction/constraint rules.
 *   - On success, atomically creates/updates assignment + writes audit record (EMERGENCY_COVERAGE_REPLACE)
 *     + writes notification row + inserts outbox event.
 *   - Failed emergency coverage leaves zero partial audit, notification, or outbox state.
 *
 * Design-spec reference: §3.8 Cutoff behavior, §8.1 Sunday Night Chaos.
 * Test layer: PostgreSQL integration.
 */

describe("Audited emergency coverage — Sunday Night Chaos", () => {
  it("assignEmergencyCoverage succeeds inside cutoff when a valid reason is provided", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { createStaffSkill, createStaffCertification, createAvailabilityRule } =
      await import("@/tests/helpers/scheduling");
    const { publishScheduleWeek } = await import("@/server/scheduling/lifecycle");
    const { assignEmergencyCoverage } = await import("@/server/scheduling/emergency");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, auditLogs, notifications, outboxEvents } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { userId: staffId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffId, skillId);
    await createStaffCertification(staffId, locationId);

    // Give staff full availability covering the shift
    await createAvailabilityRule(staffId, {
      weekday: new Date(Date.now() + 2 * 60 * 60 * 1000).getUTCDay() || 7,
      startLocalTime: "00:00",
      endLocalTime: "23:59",
      timezone: "America/New_York",
    });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");

    // Shift starts in 1 hour (strictly inside the 48h cutoff window)
    const startsAt = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);

    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt,
      endsAt,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await publishScheduleWeek(weekId, actor!);

    // Perform emergency assignment inside cutoff window
    const result = await assignEmergencyCoverage(
      {
        shiftId,
        staffId,
        reason: "Last minute call-out by primary server",
      },
      actor!
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.assignmentId).toBeDefined();

      // 1. Verify assignment created
      const [assignmentRow] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, result.assignmentId));
      expect(assignmentRow).toBeDefined();
      expect(assignmentRow.staffId).toBe(staffId);

      // 2. Verify audit record created with action EMERGENCY_COVERAGE_REPLACE
      const auditRows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, result.assignmentId));
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe("EMERGENCY_COVERAGE_REPLACE");

      // 3. Verify notification row created for staff
      const notificationRows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, staffId));
      expect(notificationRows.length).toBeGreaterThan(0);

      // 4. Verify outbox event written
      const outboxRows = await db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.event, "emergency-coverage.assigned"));
      expect(outboxRows.length).toBeGreaterThan(0);
    }
  });

  it("rejects emergency coverage if reason is missing or empty", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { createStaffSkill, createStaffCertification, createAvailabilityRule } =
      await import("@/tests/helpers/scheduling");
    const { publishScheduleWeek } = await import("@/server/scheduling/lifecycle");
    const { assignEmergencyCoverage } = await import("@/server/scheduling/emergency");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { userId: staffId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffId, skillId);
    await createStaffCertification(staffId, locationId);
    await createAvailabilityRule(staffId, {
      weekday: new Date(Date.now() + 2 * 60 * 60 * 1000).getUTCDay() || 7,
      startLocalTime: "00:00",
      endLocalTime: "23:59",
      timezone: "America/New_York",
    });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");
    const startsAt = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);

    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt,
      endsAt,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await publishScheduleWeek(weekId, actor!);

    // Omit reason (blank string)
    const result = await assignEmergencyCoverage(
      {
        shiftId,
        staffId,
        reason: "   ", // whitespace only
      },
      actor!
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.blockers).toContainEqual(
        expect.objectContaining({ code: "EMERGENCY_REASON_REQUIRED" })
      );
    }
  });

  it("failed emergency coverage creates zero partial audit, notification, or outbox rows", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { createStaffCertification } = await import("@/tests/helpers/scheduling");
    const { publishScheduleWeek } = await import("@/server/scheduling/lifecycle");
    const { assignEmergencyCoverage } = await import("@/server/scheduling/emergency");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, auditLogs, notifications, outboxEvents } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { userId: staffId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "bartender", name: "Bartender" });
    // Staff does NOT have bartender skill -> constraint evaluation will block assignment
    await createStaffCertification(staffId, locationId);

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "draft");
    const startsAt = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);

    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt,
      endsAt,
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await publishScheduleWeek(weekId, actor!);

    // Publication is itself an audited/outbox-producing mutation. Capture the
    // post-publication baseline so this test proves the failed emergency
    // attempt added no partial state of its own.
    const baselineAuditRows = await db.select().from(auditLogs).where(eq(auditLogs.actorId, managerId));
    const baselineNotificationRows = await db.select().from(notifications).where(eq(notifications.userId, staffId));
    const baselineOutboxRows = await db.select().from(outboxEvents);

    const result = await assignEmergencyCoverage(
      {
        shiftId,
        staffId,
        reason: "Need emergency coverage",
      },
      actor!
    );

    expect(result.success).toBe(false);

    // Verify NO assignment, audit, notification, or outbox rows exist for this attempt
    const assignmentRows = await db.select().from(assignments).where(eq(assignments.staffId, staffId));
    expect(assignmentRows).toHaveLength(0);

    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.actorId, managerId));
    expect(auditRows).toHaveLength(baselineAuditRows.length);

    const notificationRows = await db.select().from(notifications).where(eq(notifications.userId, staffId));
    expect(notificationRows).toHaveLength(baselineNotificationRows.length);

    const outboxRows = await db.select().from(outboxEvents);
    expect(outboxRows).toHaveLength(baselineOutboxRows.length);
  });
});
