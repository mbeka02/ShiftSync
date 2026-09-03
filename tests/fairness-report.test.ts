import { describe, it, expect } from "vitest";

/**
 * Slice 6 — Opportunity-Normalized Fairness Report
 *
 * Seam: getFairnessReport(locationId: string, scheduleWeekId: string, actor: EnrichedSession)
 *
 * Requirements:
 *   - Evaluates allocation of premium shifts (e.g., weekend or night shifts) among qualified staff.
 *   - Computes expected allocation based on actual eligible opportunities vs actual assigned premium shifts.
 *   - Exposes raw shift evidence per staff member.
 *
 * Test layer: PostgreSQL integration.
 */

describe("Opportunity-normalized fairness report", () => {
  it("calculates opportunity-normalized expected vs actual premium shift allocation", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
      certifyStaffForLocation,
      assignSkillToStaff,
    } = await import("@/tests/helpers/data");
    const { getFairnessReport } = await import("@/server/reports/fairness");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager");
    const { userId: staffAId } = await createTestUser("staff", { firstName: "Alice" });
    const { userId: staffBId } = await createTestUser("staff", { firstName: "Bob" });

    const locationId = await createTestLocation();
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });

    await certifyStaffForLocation(staffAId, locationId);
    await assignSkillToStaff(staffAId, skillId);

    await certifyStaffForLocation(staffBId, locationId);
    await assignSkillToStaff(staffBId, skillId);

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");

    // Create 2 premium shifts (e.g. weekend shifts on Saturday)
    const saturday = new Date("2026-09-19T18:00:00Z");
    const shift1Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: saturday, endsAt: new Date(saturday.getTime() + 6 * 3600000), isPremium: true, updatedBy: managerId });
    const shift2Id = await createShift({ scheduleWeekId: weekId, locationId, requiredSkillId: skillId, startsAt: new Date(saturday.getTime() + 24 * 3600000), endsAt: new Date(saturday.getTime() + 30 * 3600000), isPremium: true, updatedBy: managerId });

    // Assign both premium shifts to Staff A (creating an un-fairness complaint scenario for Staff B)
    await createAssignment(shift1Id, staffAId, managerId);
    await createAssignment(shift2Id, staffAId, managerId);

    const managerActor = await getAuthenticatedUser(managerHeaders);
    const report = await getFairnessReport(locationId, weekId, managerActor!);

    expect(report.summary.totalPremiumShifts).toBe(2);
    expect(report.staffFairness.length).toBeGreaterThanOrEqual(2);

    const itemA = report.staffFairness.find((s) => s.staffId === staffAId);
    const itemB = report.staffFairness.find((s) => s.staffId === staffBId);

    expect(itemA).toBeDefined();
    expect(itemB).toBeDefined();

    expect(itemA!.actualPremiumShifts).toBe(2);
    expect(itemB!.actualPremiumShifts).toBe(0);
    expect(itemA!.expectedPremiumShifts).toBeCloseTo(1.0, 1);
    expect(itemB!.expectedPremiumShifts).toBeCloseTo(1.0, 1);
  });
});
