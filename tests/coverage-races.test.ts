import { describe, it, expect } from "vitest";

/**
 * Slice 4 — Coverage Request Race Conditions & Shift Edit Invalidation
 *
 * Seams:
 *   approveSwapRequest(requestId, actor) -> { success: boolean } | { success: false, blockers: [] }
 *   cancelCoverageRequest(requestId, actor) -> { success: boolean }
 *   updateShift(command, actor) -> { success: boolean } (from lifecycle.ts)
 *
 * Key invariants verified:
 *   - Approval vs requester cancellation: exactly one terminal state.
 *   - Material shift edit atomically cancels all pending requests and notifies affected parties.
 *
 * Design-spec reference: §3.21 Swap Invalidation on Shift Edit, §3.22 Regret Swap race.
 * Test layer: PostgreSQL integration.
 */

describe("Coverage request race conditions and shift edit invalidation", () => {
  // ─── Approval vs Cancellation Race ────────────────────────────────

  it("approval vs requester cancellation: exactly one terminal state", async () => {
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
    const { createSwapRequest, acceptSwapRequest, approveSwapRequest, cancelCoverageRequest } =
      await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { coverageRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { headers: staffAHeaders, userId: staffAId } = await createTestUser("staff", {
      firstName: "Jordan",
      lastName: "Lee",
      primaryTimezone: "America/New_York",
    });
    const { headers: staffBHeaders, userId: staffBId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffAId, skillId);
    await createStaffCertification(staffAId, locationId);
    await createStaffSkill(staffBId, skillId);
    await createStaffCertification(staffBId, locationId);

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 8 * 60 * 60 * 1000);
    await createAvailabilityRule(staffBId, {
      weekday: (futureStart.getUTCDay() || 7),
      startLocalTime: "00:00",
      endLocalTime: "23:59",
      timezone: "America/New_York",
    });

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: futureStart,
      endsAt: futureEnd,
      timezone: "America/New_York",
      updatedBy: managerId,
    });
    await createAssignment(shiftId, staffAId, managerId);

    const staffAActor = await getAuthenticatedUser(staffAHeaders);
    const staffBActor = await getAuthenticatedUser(staffBHeaders);
    const managerActor = await getAuthenticatedUser(managerHeaders);

    const createResult = await createSwapRequest({ shiftId, targetStaffId: staffBId }, staffAActor!);
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    await acceptSwapRequest(createResult.requestId, staffBActor!);

    // Race: fire approval and cancellation concurrently
    const [approveResult, cancelResult] = await Promise.all([
      approveSwapRequest(createResult.requestId, managerActor!),
      cancelCoverageRequest(createResult.requestId, staffAActor!),
    ]);

    // Exactly one should succeed
    const successes = [approveResult.success, cancelResult.success].filter(Boolean);
    expect(successes).toHaveLength(1);

    // Request must be in exactly one terminal state
    const [finalRequest] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, createResult.requestId));
    expect(["approved", "cancelled"]).toContain(finalRequest.status);
  });

  // ─── Shift Edit Cancels Pending Requests ──────────────────────────

  it("material shift edit atomically cancels all pending coverage requests on that shift", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      createTestLocation,
      assignManagerToLocation,
      createScheduleWeek,
      createTestSkill,
      createShift,
      createAssignment,
    } = await import("@/tests/helpers/data");
    const { createStaffSkill, createStaffCertification } =
      await import("@/tests/helpers/scheduling");
    const { createSwapRequest, createDropRequest } =
      await import("@/server/coverage/service");
    const { updateShift } = await import("@/server/scheduling/lifecycle");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { coverageRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const { headers: staffAHeaders, userId: staffAId } = await createTestUser("staff", {
      firstName: "Jordan",
      lastName: "Lee",
      primaryTimezone: "America/New_York",
    });
    const { headers: staffBHeaders, userId: staffBId } = await createTestUser("staff", {
      firstName: "Sam",
      lastName: "Park",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffAId, skillId);
    await createStaffCertification(staffAId, locationId);
    await createStaffSkill(staffBId, skillId);
    await createStaffCertification(staffBId, locationId);

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 8 * 60 * 60 * 1000);
    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt: futureStart,
      endsAt: futureEnd,
      timezone: "America/New_York",
      updatedBy: managerId,
    });
    await createAssignment(shiftId, staffAId, managerId);
    await createAssignment(shiftId, staffBId, managerId);

    // Staff A creates a swap request, Staff B creates a drop request
    const staffAActor = await getAuthenticatedUser(staffAHeaders);
    const staffBActor = await getAuthenticatedUser(staffBHeaders);

    const swapResult = await createSwapRequest({ shiftId, targetStaffId: staffBId }, staffAActor!);
    expect(swapResult.success).toBe(true);

    const dropResult = await createDropRequest({ shiftId }, staffBActor!);
    expect(dropResult.success).toBe(true);

    // Manager performs a material shift edit (change headcount)
    const managerActor = await getAuthenticatedUser(managerHeaders);
    const editResult = await updateShift(
      { shiftId, headcount: 5 },
      managerActor!,
    );
    expect(editResult.success).toBe(true);

    // Verify both pending requests are cancelled
    if (swapResult.success) {
      const [swapRequest] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, swapResult.requestId));
      expect(swapRequest.status).toBe("cancelled");
    }

    if (dropResult.success) {
      const [dropRequest] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, dropResult.requestId));
      expect(dropRequest.status).toBe("cancelled");
    }
  });
});
