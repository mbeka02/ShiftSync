import { describe, it, expect } from "vitest";

/**
 * Slice 5 — On-Duty State Machine & Time Entries
 *
 * Seam:
 *   clockInStaff(command: { assignmentId: string }, actor: EnrichedSession) -> { success: true, timeEntryId: string } | { success: false, blockers: [] }
 *   clockOutStaff(command: { timeEntryId: string }, actor: EnrichedSession) -> { success: true } | { success: false, blockers: [] }
 *   getOnDutyStaff(locationId: string, actor: EnrichedSession) -> Array<OnDutyStaffView>
 *
 * Invariants:
 *   - Only assigned staff members can clock in to their shift.
 *   - Enforces max 1 open time entry (clockedOutAt IS NULL) per staff member.
 *   - Clock-out sets clockedOutAt timestamp and closes entry.
 *   - getOnDutyStaff returns currently clocked-in staff for that location (open time entries only),
 *     not merely scheduled staff.
 *   - Location-scoped manager authorization is enforced for getOnDutyStaff.
 *
 * Test layer: PostgreSQL integration.
 */

describe("On-duty state machine and time entries", () => {
  it("allows staff to clock in to assigned shift, prevents duplicate open clock-in, and closes entry on clock-out", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { clockInStaff, clockOutStaff, getOnDutyStaff } = await import("@/server/onduty/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { headers: staffHeaders, userId: staffId } = await createTestUser("staff", {
      firstName: "Jordan",
      lastName: "Lee",
    });

    const locationId = await createTestLocation({ name: "Harbor Central", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "cook", name: "Line Cook" });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");
    const shiftStart = new Date(Date.now() - 30 * 60 * 1000); // Shift started 30 mins ago
    const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);

    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: shiftStart,
      endsAt: shiftEnd,
      timezone: "America/New_York",
      updatedBy: managerId,
    });
    const assignmentId = await createAssignment(shiftId, staffId, managerId);

    const staffActor = await getAuthenticatedUser(staffHeaders);
    const managerActor = await getAuthenticatedUser(managerHeaders);

    // 1. Clock in
    const clockInResult = await clockInStaff({ assignmentId }, staffActor!);
    expect(clockInResult.success).toBe(true);
    if (!clockInResult.success) return;

    const timeEntryId = clockInResult.timeEntryId;
    expect(timeEntryId).toBeDefined();

    // 2. Duplicate clock-in while entry is open should fail
    const duplicateResult = await clockInStaff({ assignmentId }, staffActor!);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(duplicateResult.blockers).toContainEqual(
        expect.objectContaining({ code: "STAFF_ALREADY_CLOCKED_IN" })
      );
    }

    // 3. Manager checks on-duty dashboard
    const onDutyList = await getOnDutyStaff(locationId, managerActor!);
    expect(onDutyList.length).toBe(1);
    expect(onDutyList[0].staffId).toBe(staffId);
    expect(onDutyList[0].staffName).toBe("Jordan Lee");
    expect(onDutyList[0].skillName).toBe("Line Cook");

    // 4. Clock out
    const clockOutResult = await clockOutStaff({ timeEntryId }, staffActor!);
    expect(clockOutResult.success).toBe(true);

    // 5. On-duty dashboard should now be empty (entry is closed)
    const onDutyAfterOut = await getOnDutyStaff(locationId, managerActor!);
    expect(onDutyAfterOut.length).toBe(0);
  });

  it("prevents staff from clocking in to an assignment belonging to another staff member", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { clockInStaff } = await import("@/server/onduty/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { userId: managerId } = await createTestUser("manager");
    const { userId: staffAId } = await createTestUser("staff", { firstName: "Staff", lastName: "A" });
    const { headers: staffBHeaders } = await createTestUser("staff", { firstName: "Staff", lastName: "B" });

    const locationId = await createTestLocation();
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill();
    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");
    const shiftId = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, updatedBy: managerId });
    const assignmentId = await createAssignment(shiftId, staffAId, managerId);

    const staffBActor = await getAuthenticatedUser(staffBHeaders);

    // Staff B attempts to clock into Staff A's assignment
    const clockInResult = await clockInStaff({ assignmentId }, staffBActor!);
    expect(clockInResult.success).toBe(false);
  });
});
