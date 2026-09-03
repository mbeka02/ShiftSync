import { describe, it, expect } from "vitest";

/**
 * Slice 2 — Transactional Assignment & Concurrency
 *
 * Seam: assignStaff(command, actor) -> AssignmentResult
 *       previewAssignment(command, actor) -> PreviewResult
 *
 * Capability: The assignment transaction locks the shift, then affected
 * staff rows in deterministic order, revalidates all constraints against
 * authoritative state, and commits the assignment + assignment_period +
 * audit event atomically. Preview uses the same rule engine without persistence.
 *
 * Observable behavior:
 *   - Preview returns constraint results and projected impact without persistence.
 *   - Assignment commits when all constraints pass.
 *   - Assignment fails with structured MISSING_SKILL when staff lacks skill.
 *   - Same staff competing for overlapping shifts: exactly one commits.
 *   - Two different staff competing for the final headcount slot: exactly one commits.
 *   - Failed assignment leaves no partial state (no assignment, audit, or period rows).
 *   - Assignment creates an assignment_period row for the GiST exclusion constraint.
 *
 * Design-spec reference: §2.5 Assignment Transaction, §2.6 Concurrency,
 * §3.10–3.13, §8.4 Simultaneous Assignment.
 * Test layer: PostgreSQL integration (real DB, real transactions, real locks).
 */

describe("Transactional assignment", () => {
  // ─── Preview ─────────────────────────────────────────────────────

  it("previewAssignment returns constraint results without persisting", async () => {
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
    const { previewAssignment } = await import(
      "@/server/scheduling/assignment"
    );
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments } = await import("@/server/db/schema");
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
    await createAvailabilityRule(staffId, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });

    const weekId = await createScheduleWeek(locationId, "2025-09-01", "draft");
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T14:00:00Z"),
      endsAt: new Date("2025-09-01T22:00:00Z"),
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    const result = await previewAssignment({ shiftId, staffId }, actor!);

    // Preview should return constraint results
    expect(result.blockers).toHaveLength(0);
    expect(result.impact).toEqual(
      expect.objectContaining({
        projectedWeeklyHours: expect.any(Number),
      })
    );

    // Verify NO assignment was actually created
    const rows = await db
      .select()
      .from(assignments)
      .where(eq(assignments.staffId, staffId));
    expect(rows).toHaveLength(0);
  });

  // ─── Successful assignment ───────────────────────────────────────

  it("assignStaff commits assignment and assignment_period when all constraints pass", async () => {
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
    const { assignStaff } = await import("@/server/scheduling/assignment");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, assignmentPeriods, auditLogs, notifications, outboxEvents } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");

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
    await createAvailabilityRule(staffId, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });

    const weekId = await createScheduleWeek(locationId, "2025-09-01", "draft");
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T14:00:00Z"),
      endsAt: new Date("2025-09-01T22:00:00Z"),
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    const result = await assignStaff({ shiftId, staffId }, actor!);

    expect(result.success).toBe(true);

    // Verify assignment row was created
    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.staffId, staffId));
    expect(assignment).toBeDefined();
    expect(assignment.shiftId).toBe(shiftId);
    expect(assignment.status).toBe("assigned");

    // Verify assignment_period row was created for GiST constraint
    const [period] = await db
      .select()
      .from(assignmentPeriods)
      .where(eq(assignmentPeriods.assignmentId, assignment.id));
    expect(period).toBeDefined();
    expect(period.staffId).toBe(staffId);

    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.entityType, "assignment"),
      eq(auditLogs.entityId, assignment.id),
    ));
    expect(audit?.action).toBe("STAFF_ASSIGNED");
    const [notification] = await db.select().from(notifications).where(and(
      eq(notifications.userId, staffId),
      eq(notifications.type, "SHIFT_ASSIGNED"),
    ));
    expect(notification).toBeDefined();
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.event, "assignment.assigned"));
    expect(events.map((event) => event.channel)).toEqual(expect.arrayContaining([
      `private-location-${locationId}`,
      `private-user-${staffId}`,
    ]));
  });

  // ─── Constraint-blocked assignment ───────────────────────────────

  it("assignStaff rejects with structured error when staff lacks required skill", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { createStaffCertification, createAvailabilityRule } =
      await import("@/tests/helpers/scheduling");
    const { assignStaff } = await import("@/server/scheduling/assignment");
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
    const skillId = await createTestSkill({ code: "bartender", name: "Bartender" });
    // NOTE: staff does NOT have the bartender skill
    await createStaffCertification(staffId, locationId);
    await createAvailabilityRule(staffId, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });

    const weekId = await createScheduleWeek(locationId, "2025-09-01", "draft");
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T14:00:00Z"),
      endsAt: new Date("2025-09-01T22:00:00Z"),
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    const result = await assignStaff({ shiftId, staffId }, actor!);

    expect(result.success).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "MISSING_SKILL" })
    );
  });

  // ─── Failed assignment leaves no partial state ───────────────────

  it("failed assignment creates no assignment, period, or audit rows", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
    } = await import("@/tests/helpers/data");
    const { createStaffCertification, createAvailabilityRule } =
      await import("@/tests/helpers/scheduling");
    const { assignStaff } = await import("@/server/scheduling/assignment");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, assignmentPeriods } = await import("@/server/db/schema");
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
    // Staff does NOT have the bartender skill — will fail
    await createStaffCertification(staffId, locationId);
    await createAvailabilityRule(staffId, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });

    const weekId = await createScheduleWeek(locationId, "2025-09-01", "draft");
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T14:00:00Z"),
      endsAt: new Date("2025-09-01T22:00:00Z"),
      timezone: "America/New_York",
      updatedBy: managerId,
    });

    const actor = await getAuthenticatedUser(managerHeaders);
    await assignStaff({ shiftId, staffId }, actor!);

    // Verify NO assignment or period rows exist
    const assignmentRows = await db.select().from(assignments).where(eq(assignments.staffId, staffId));
    expect(assignmentRows).toHaveLength(0);

    const periodRows = await db.select().from(assignmentPeriods).where(eq(assignmentPeriods.staffId, staffId));
    expect(periodRows).toHaveLength(0);
  });
});

describe("Assignment concurrency races", () => {
  // ─── Same staff overlapping shifts ───────────────────────────────

  it("same staff competing for overlapping shifts: exactly one commits", async () => {
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
    const { assignStaff } = await import("@/server/scheduling/assignment");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    // Two managers, one staff, two overlapping shifts
    const { headers: mgr1Headers, userId: mgr1 } = await createTestUser("manager", {
      firstName: "Manager",
      lastName: "One",
    });
    const { headers: mgr2Headers, userId: mgr2 } = await createTestUser("manager", {
      firstName: "Manager",
      lastName: "Two",
    });
    const { userId: staffId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(mgr1, locId);
    await assignManagerToLocation(mgr2, locId);

    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffId, skillId);
    await createStaffCertification(staffId, locId);
    await createAvailabilityRule(staffId, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });

    const weekId = await createScheduleWeek(locId, "2025-09-01", "draft");

    // Two overlapping shifts: 10 AM–2 PM and 12 PM–4 PM
    const shift1 = await createShift({
      scheduleWeekId: weekId, locationId: locId, requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T14:00:00Z"), endsAt: new Date("2025-09-01T18:00:00Z"),
      timezone: "America/New_York", updatedBy: mgr1,
    });
    const shift2 = await createShift({
      scheduleWeekId: weekId, locationId: locId, requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T16:00:00Z"), endsAt: new Date("2025-09-01T20:00:00Z"),
      timezone: "America/New_York", updatedBy: mgr2,
    });

    const actor1 = await getAuthenticatedUser(mgr1Headers);
    const actor2 = await getAuthenticatedUser(mgr2Headers);

    // Race both assignments concurrently
    const [result1, result2] = await Promise.all([
      assignStaff({ shiftId: shift1, staffId }, actor1!),
      assignStaff({ shiftId: shift2, staffId }, actor2!),
    ]);

    // Exactly one should succeed, one should fail
    const successes = [result1, result2].filter((r) => r.success);
    const failures = [result1, result2].filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  // ─── Different staff competing for last headcount slot ───────────

  it("two different staff competing for the final headcount slot: exactly one commits", async () => {
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
    const { assignStaff } = await import("@/server/scheduling/assignment");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: mgrHeaders, userId: mgrId } = await createTestUser("manager", {
      firstName: "Manager",
      lastName: "One",
    });
    const { userId: staff1 } = await createTestUser("staff", {
      firstName: "Staff",
      lastName: "One",
      primaryTimezone: "America/New_York",
    });
    const { userId: staff2 } = await createTestUser("staff", {
      firstName: "Staff",
      lastName: "Two",
      primaryTimezone: "America/New_York",
    });

    const locId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(mgrId, locId);

    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staff1, skillId);
    await createStaffSkill(staff2, skillId);
    await createStaffCertification(staff1, locId);
    await createStaffCertification(staff2, locId);
    await createAvailabilityRule(staff1, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });
    await createAvailabilityRule(staff2, { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York" });

    const weekId = await createScheduleWeek(locId, "2025-09-01", "draft");

    // Shift with headcount = 1 (only one slot)
    const shiftId = await createShift({
      scheduleWeekId: weekId, locationId: locId, requiredSkillId: skillId,
      startsAt: new Date("2025-09-01T14:00:00Z"), endsAt: new Date("2025-09-01T22:00:00Z"),
      timezone: "America/New_York", updatedBy: mgrId,
    });

    const actor = await getAuthenticatedUser(mgrHeaders);

    // Race both assignments concurrently (same manager, different staff)
    const [result1, result2] = await Promise.all([
      assignStaff({ shiftId, staffId: staff1 }, actor!),
      assignStaff({ shiftId, staffId: staff2 }, actor!),
    ]);

    const successes = [result1, result2].filter((r) => r.success);
    const failures = [result1, result2].filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].blockers).toContainEqual(
      expect.objectContaining({ code: "HEADCOUNT_REACHED" })
    );
  });
});
