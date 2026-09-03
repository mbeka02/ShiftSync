import { describe, it, expect } from "vitest";

/**
 * Slice 6 — Overtime Analysis & Threshold Evidence
 *
 * Seam: getOvertimeReport(locationId: string, scheduleWeekId: string, actor: EnrichedSession)
 *
 * Requirements:
 *   - Aggregates assigned hours per staff member for a location/week.
 *   - Identifies the specific assignment that causes staff to cross the weekly threshold (e.g. 40 hours).
 *   - Calculates projected standard wages, overtime premium hours, and total projected wages.
 *   - Enforces location manager authorization.
 *
 * Test layer: PostgreSQL integration.
 */

describe("Overtime analysis and threshold report", () => {
  it("identifies the threshold-causing assignment and calculates projected overtime cost", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { getOvertimeReport } = await import("@/server/reports/overtime");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager");
    const { userId: staffId } = await createTestUser("staff", { firstName: "Sam", lastName: "Overtime" });

    const locationId = await createTestLocation();
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill();
    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");

    // Create 5 shifts of 9 hours each = 45 total hours
    // Shift 1: 9 hrs (0 - 9)
    // Shift 2: 9 hrs (9 - 18)
    // Shift 3: 9 hrs (18 - 27)
    // Shift 4: 9 hrs (27 - 36) -> Total 36
    // Shift 5: 9 hrs (36 - 45) -> Crosses 40-hour threshold at Shift 5!
    const baseDate = new Date("2026-09-14T08:00:00Z");

    const shift1Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: new Date(baseDate.getTime()), endsAt: new Date(baseDate.getTime() + 9 * 3600000), updatedBy: managerId });
    await createAssignment(shift1Id, staffId, managerId);

    const shift2Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: new Date(baseDate.getTime() + 24 * 3600000), endsAt: new Date(baseDate.getTime() + 33 * 3600000), updatedBy: managerId });
    await createAssignment(shift2Id, staffId, managerId);

    const shift3Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: new Date(baseDate.getTime() + 48 * 3600000), endsAt: new Date(baseDate.getTime() + 57 * 3600000), updatedBy: managerId });
    await createAssignment(shift3Id, staffId, managerId);

    const shift4Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: new Date(baseDate.getTime() + 72 * 3600000), endsAt: new Date(baseDate.getTime() + 81 * 3600000), updatedBy: managerId });
    await createAssignment(shift4Id, staffId, managerId);

    const shift5Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: new Date(baseDate.getTime() + 96 * 3600000), endsAt: new Date(baseDate.getTime() + 105 * 3600000), updatedBy: managerId });
    const thresholdAssignmentId = await createAssignment(shift5Id, staffId, managerId);

    const managerActor = await getAuthenticatedUser(managerHeaders);
    const report = await getOvertimeReport(locationId, weekId, managerActor!);

    expect(report.staffOvertime.length).toBe(1);
    const item = report.staffOvertime[0];
    expect(item.staffId).toBe(staffId);
    expect(item.totalHours).toBe(45);
    expect(item.overtimeHours).toBe(5);
    expect(item.thresholdCausingAssignmentId).toBe(thresholdAssignmentId);
  });
});
