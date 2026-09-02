import { describe, it, expect } from "vitest";

/**
 * Slice 4 — Swap Request State Machine
 *
 * Seam:
 *   createSwapRequest(command, actor) -> { success: true, requestId: string } | { success: false, blockers: [] }
 *   acceptSwapRequest(requestId, actor) -> { success: boolean }
 *   approveSwapRequest(requestId, actor) -> { success: boolean } | { success: false, blockers: [] }
 *   cancelCoverageRequest(requestId, actor) -> { success: boolean }
 *
 * Swap lifecycle:
 *   PENDING_TARGET -> ACCEPTED_BY_TARGET -> APPROVED
 *   PENDING_TARGET -> CANCELLED
 *   ACCEPTED_BY_TARGET -> CANCELLED (Regret Swap)
 *   ACCEPTED_BY_TARGET -> REJECTED
 *
 * Key invariants:
 *   - Original assignment remains active until manager approval commits.
 *   - Approval locks shift->request->staff in deterministic order, reruns constraints.
 *   - Requester cancellation after target acceptance but before approval is valid (Regret Swap).
 *   - Maximum 3 pending requests per staff member enforced transactionally.
 *
 * Design-spec reference: §3.19 coverage_requests, §3.20 Pending Request Limit, §3.22 Regret Swap, §8.6.
 * Test layer: PostgreSQL integration.
 */

describe("Swap request state machine", () => {
  // ─── Full Swap Lifecycle ──────────────────────────────────────────

  it("full swap lifecycle: create -> target accept -> manager approve transfers assignment", async () => {
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
    const { createSwapRequest, acceptSwapRequest, approveSwapRequest } =
      await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, coverageRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    // Setup: manager, two staff, location, shift, and assignment for Staff A
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

    // Qualify both staff for the location and skill
    await createStaffSkill(staffAId, skillId);
    await createStaffCertification(staffAId, locationId);
    await createStaffSkill(staffBId, skillId);
    await createStaffCertification(staffBId, locationId);

    // Give Staff B availability covering the shift
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 8 * 60 * 60 * 1000);
    const weekday = (futureStart.getUTCDay() || 7);
    await createAvailabilityRule(staffBId, {
      weekday,
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

    // Assign Staff A to the shift
    const assignmentId = await createAssignment(shiftId, staffAId, managerId);

    // 1. Staff A creates a swap request targeting Staff B
    const staffAActor = await getAuthenticatedUser(staffAHeaders);
    const createResult = await createSwapRequest(
      { shiftId, targetStaffId: staffBId, reason: "Family event" },
      staffAActor!,
    );
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const requestId = createResult.requestId;

    // Verify request status is PENDING_TARGET
    const [request1] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, requestId));
    expect(request1.status).toBe("pending_target");

    // 2. Staff B accepts the swap
    const staffBActor = await getAuthenticatedUser(staffBHeaders);
    const acceptResult = await acceptSwapRequest(requestId, staffBActor!);
    expect(acceptResult.success).toBe(true);

    // Verify request status is ACCEPTED_BY_TARGET
    const [request2] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, requestId));
    expect(request2.status).toBe("accepted_by_target");

    // Verify original assignment is still active (not yet transferred)
    const [originalAssignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(originalAssignment.status).toBe("assigned");

    // 3. Manager approves the swap
    const managerActor = await getAuthenticatedUser(managerHeaders);
    const approveResult = await approveSwapRequest(requestId, managerActor!);
    expect(approveResult.success).toBe(true);

    // Verify: Staff A's assignment is removed, Staff B has a new active assignment
    const [removedAssignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(removedAssignment.status).toBe("removed");

    const [newAssignment] = await db.select().from(assignments).where(eq(assignments.staffId, staffBId));
    expect(newAssignment).toBeDefined();
    expect(newAssignment.status).toBe("assigned");
    expect(newAssignment.shiftId).toBe(shiftId);

    // Verify request status is APPROVED
    const [request3] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, requestId));
    expect(request3.status).toBe("approved");
  });

  // ─── Regret Swap ──────────────────────────────────────────────────

  it("Regret Swap: requester cancels after target acceptance but before approval", async () => {
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
    const { createSwapRequest, acceptSwapRequest, cancelCoverageRequest } =
      await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, coverageRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const { userId: managerId } = await createTestUser("manager", { firstName: "Alex", lastName: "Rivera" });
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
    const assignmentId = await createAssignment(shiftId, staffAId, managerId);

    // Create swap, accept, then cancel
    const staffAActor = await getAuthenticatedUser(staffAHeaders);
    const staffBActor = await getAuthenticatedUser(staffBHeaders);

    const createResult = await createSwapRequest({ shiftId, targetStaffId: staffBId }, staffAActor!);
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    await acceptSwapRequest(createResult.requestId, staffBActor!);

    // Staff A regrets and cancels
    const cancelResult = await cancelCoverageRequest(createResult.requestId, staffAActor!);
    expect(cancelResult.success).toBe(true);

    // Verify: request is cancelled, original assignment untouched
    const [request] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, createResult.requestId));
    expect(request.status).toBe("cancelled");

    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(assignment.status).toBe("assigned");
  });

  // ─── Pending Request Limit ────────────────────────────────────────

  it("rejects a 4th pending swap request for the same staff member", async () => {
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
    const { createSwapRequest } = await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { userId: managerId } = await createTestUser("manager", { firstName: "Alex", lastName: "Rivera" });
    const { headers: staffAHeaders, userId: staffAId } = await createTestUser("staff", {
      firstName: "Jordan",
      lastName: "Lee",
      primaryTimezone: "America/New_York",
    });
    const { userId: staffBId } = await createTestUser("staff", {
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

    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");

    // Create 4 shifts and assign Staff A to all of them
    const shiftIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const start = new Date(Date.now() + (7 + i) * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
      const shiftId = await createShift({
        scheduleWeekId: weekId,
        locationId,
        requiredSkillId: skillId,
        startsAt: start,
        endsAt: end,
        timezone: "America/New_York",
        updatedBy: managerId,
      });
      await createAssignment(shiftId, staffAId, managerId);
      shiftIds.push(shiftId);
    }

    const staffAActor = await getAuthenticatedUser(staffAHeaders);

    // Create 3 swap requests (should succeed)
    for (let i = 0; i < 3; i++) {
      const result = await createSwapRequest({ shiftId: shiftIds[i], targetStaffId: staffBId }, staffAActor!);
      expect(result.success).toBe(true);
    }

    // 4th request should be blocked
    const fourthResult = await createSwapRequest({ shiftId: shiftIds[3], targetStaffId: staffBId }, staffAActor!);
    expect(fourthResult.success).toBe(false);
    if (!fourthResult.success) {
      expect(fourthResult.blockers).toContainEqual(
        expect.objectContaining({ code: "PENDING_REQUEST_LIMIT" }),
      );
    }
  });
});
