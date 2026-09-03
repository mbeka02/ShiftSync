import { describe, expect, it } from "vitest";

describe("Coverage manager rejection", () => {
  it("rejects an accepted swap without changing the assignment and notifies both staff members", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      assignManagerToLocation,
      createAssignment,
      createScheduleWeek,
      createShift,
      createTestLocation,
      createTestSkill,
    } = await import("@/tests/helpers/data");
    const { createStaffCertification, createStaffSkill } = await import("@/tests/helpers/scheduling");
    const {
      acceptSwapRequest,
      createSwapRequest,
      rejectCoverageRequest,
    } = await import("@/server/coverage/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");
    const { db } = await import("@/server/db");
    const { assignments, coverageRequests, notifications, outboxEvents } = await import("@/server/db/schema");
    const { and, eq, inArray } = await import("drizzle-orm");

    const manager = await createTestUser("manager", { firstName: "Alex", lastName: "Rivera" });
    const requester = await createTestUser("staff", { firstName: "Maria", lastName: "Chen" });
    const target = await createTestUser("staff", { firstName: "Jordan", lastName: "Lee" });
    const locationId = await createTestLocation({ name: "Harbor East", timezone: "America/New_York" });
    await assignManagerToLocation(manager.userId, locationId);
    const skillId = await createTestSkill({ code: "server", name: "Server" });
    await createStaffSkill(requester.userId, skillId);
    await createStaffCertification(requester.userId, locationId);
    await createStaffSkill(target.userId, skillId);
    await createStaffCertification(target.userId, locationId);
    const weekId = await createScheduleWeek(locationId, "2026-09-14", "published");
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const shiftId = await createShift({
      scheduleWeekId: weekId,
      locationId,
      requiredSkillId: skillId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 6 * 60 * 60_000),
      timezone: "America/New_York",
      updatedBy: manager.userId,
    });
    const assignmentId = await createAssignment(shiftId, requester.userId, manager.userId);

    const requesterActor = await getAuthenticatedUser(requester.headers);
    const targetActor = await getAuthenticatedUser(target.headers);
    const managerActor = await getAuthenticatedUser(manager.headers);
    const created = await createSwapRequest(
      { shiftId, targetStaffId: target.userId, reason: "Family event" },
      requesterActor!,
    );
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect((await acceptSwapRequest(created.requestId, targetActor!)).success).toBe(true);

    const [managerNotice] = await db.select().from(notifications).where(and(
      eq(notifications.userId, manager.userId),
      eq(notifications.type, "COVERAGE_APPROVAL_REQUIRED"),
    ));
    expect(managerNotice).toBeDefined();
    const acceptedEvents = (await db.select().from(outboxEvents).where(eq(outboxEvents.event, "coverage.accepted_by_target")))
      .filter((event) => (event.payload as { coverageRequestId?: string }).coverageRequestId === created.requestId);
    expect(acceptedEvents.map((event) => event.channel)).toEqual(expect.arrayContaining([
      `private-location-${locationId}`,
      `private-user-${manager.userId}`,
      `private-user-${requester.userId}`,
    ]));
    expect(acceptedEvents.every((event) => !event.channel.startsWith("private-shift-"))).toBe(true);

    const result = await rejectCoverageRequest(created.requestId, managerActor!);
    expect(result.success).toBe(true);

    const [request] = await db.select().from(coverageRequests).where(eq(coverageRequests.id, created.requestId));
    expect(request.status).toBe("rejected");
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    expect(assignment.status).toBe("assigned");

    const notices = await db.select().from(notifications).where(and(
      inArray(notifications.userId, [requester.userId, target.userId]),
      eq(notifications.type, "COVERAGE_REQUEST_REJECTED"),
    ));
    expect(new Set(notices.map((notice) => notice.userId))).toEqual(new Set([requester.userId, target.userId]));
  });
});
