import { describe, it, expect } from "vitest";

/**
 * Slice 4 — Drop Request State Machine
 *
 * Seam:
 *   createDropRequest(command, actor) -> { success: true, requestId: string } | { success: false, blockers: [] }
 *   claimDropRequest(requestId, actor) -> { success: boolean } | { success: false, blockers: [] }
 *   approveDropRequest(requestId, actor) -> { success: boolean } | { success: false, blockers: [] }
 *   cancelCoverageRequest(requestId, actor) -> { success: boolean }
 *
 * Drop lifecycle:
 *   OPEN -> CLAIMED -> APPROVED
 *   OPEN -> EXPIRED
 *   OPEN -> CANCELLED
 *   CLAIMED -> CANCELLED
 *
 * Key invariants:
 *   - Original assignment remains active until manager approval commits.
 *   - Drop requests expire 24 hours before shift start (checked transactionally at claim time).
 *   - Approval locks shift->request->staff in deterministic order, reruns constraints for claimant.
 *   - Pending request limit (max 3) shared with swap requests.
 *
 * Design-spec reference: §3.19 coverage_requests, §3.23 Drop Request Expiration.
 * Test layer: PostgreSQL integration.
 */

describe("Drop request state machine", () => {
  // ─── Full Drop Lifecycle ──────────────────────────────────────────

  it("full drop lifecycle: create -> claim -> manager approve transfers assignment", async () => {
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
    const { createDropRequest, claimDropRequest, approveDropRequest } =
      await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, coverageRequests } = await import("@/server/db/schema");
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
    const { headers: claimantHeaders, userId: claimantId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });

    // Qualify both staff
    await createStaffSkill(staffAId, skillId);
    await createStaffCertification(staffAId, locationId);
    await createStaffSkill(claimantId, skillId);
    await createStaffCertification(claimantId, locationId);

    // Give claimant availability covering the shift
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 8 * 60 * 60 * 1000);
    await createAvailabilityRule(claimantId, {
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

    // 1. Staff A creates a drop request
    const staffAActor = await getAuthenticatedUser(staffAHeaders);
    const createResult = await createDropRequest({ shiftId, reason: "Personal emergency" }, staffAActor!);
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const requestId = createResult.requestId;

    // Verify request status is OPEN
    const [request1] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, requestId));
    expect(request1.status).toBe("open");
    expect(request1.type).toBe("drop");
    expect(request1.expiresAt).not.toBeNull();

    // 2. Claimant claims the drop
    const claimantActor = await getAuthenticatedUser(claimantHeaders);
    const claimResult = await claimDropRequest(requestId, claimantActor!);
    expect(claimResult.success).toBe(true);

    // Verify request status is CLAIMED
    const [request2] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, requestId));
    expect(request2.status).toBe("claimed");
    expect(request2.claimantStaffId).toBe(claimantId);

    // Verify original assignment is still active
    const [originalAssignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(originalAssignment.status).toBe("assigned");

    // 3. Manager approves the drop
    const managerActor = await getAuthenticatedUser(managerHeaders);
    const approveResult = await approveDropRequest(requestId, managerActor!);
    expect(approveResult.success).toBe(true);

    // Verify: Staff A's assignment removed, claimant has new active assignment
    const [removedAssignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(removedAssignment.status).toBe("removed");

    const [newAssignment] = await db.select().from(assignments).where(eq(assignments.staffId, claimantId));
    expect(newAssignment).toBeDefined();
    expect(newAssignment.status).toBe("assigned");
    expect(newAssignment.shiftId).toBe(shiftId);

    // Verify request status is APPROVED
    const [request3] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, requestId));
    expect(request3.status).toBe("approved");
  });

  // ─── Drop Expiration ──────────────────────────────────────────────

  it("rejects claim on an expired drop request (shift starts in < 24 hours)", async () => {
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
    const { createDropRequest, claimDropRequest } =
      await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { coverageRequests } = await import("@/server/db/schema");
    const { eq, sql } = await import("drizzle-orm");

    const { userId: managerId } = await createTestUser("manager", { firstName: "Alex", lastName: "Rivera" });
    const { headers: staffAHeaders, userId: staffAId } = await createTestUser("staff", {
      firstName: "Jordan",
      lastName: "Lee",
      primaryTimezone: "America/New_York",
    });
    const { headers: claimantHeaders, userId: claimantId } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      primaryTimezone: "America/New_York",
    });

    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(managerId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(staffAId, skillId);
    await createStaffCertification(staffAId, locationId);
    await createStaffSkill(claimantId, skillId);
    await createStaffCertification(claimantId, locationId);

    // Shift is far enough in the future to create the request, but we'll manually expire it
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

    const staffAActor = await getAuthenticatedUser(staffAHeaders);
    const createResult = await createDropRequest({ shiftId }, staffAActor!);
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    // Manually set expires_at to the past to simulate expiration
    await db.update(coverageRequests)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(coverageRequests.id, createResult.requestId));

    // Attempt to claim the expired drop
    const claimantActor = await getAuthenticatedUser(claimantHeaders);
    const claimResult = await claimDropRequest(createResult.requestId, claimantActor!);

    expect(claimResult.success).toBe(false);
    if (!claimResult.success) {
      expect(claimResult.blockers).toContainEqual(
        expect.objectContaining({ code: "DROP_REQUEST_EXPIRED" }),
      );
    }
  });
});
