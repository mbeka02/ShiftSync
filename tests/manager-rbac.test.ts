import { describe, it, expect } from "vitest";

/**
 * Slice 1 — Manager Location Authorization (RBAC)
 *
 * Seam: getScheduleForLocation(locationId, weekStart, actor) -> ScheduleView | ForbiddenResult
 *
 * Capability: Managers can only read schedules for locations they are
 * assigned to via manager_locations. Admin can read all locations.
 * Staff cannot use this manager-facing query.
 *
 * Observable behavior:
 *   - Manager assigned to Location A can read Location A's schedule.
 *   - Manager assigned to Location A receives forbidden for Location B.
 *   - Admin can read any location's schedule.
 *   - Staff receives forbidden (this is not their read path).
 *
 * Design-spec reference: §3.3 Authorization matrix, §3.4 Locations,
 * §3.8 Schedule Weeks.
 *
 * Test layer: PostgreSQL integration (real schema, real auth, real queries).
 */

describe("Manager location authorization", () => {
  it("manager assigned to a location can read that location's schedule", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { createTestLocation, assignManagerToLocation, createScheduleWeek } =
      await import("@/tests/helpers/data");
    const { getScheduleForLocation } = await import(
      "@/server/scheduling/queries"
    );
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    // Setup: manager + location + published schedule week
    const { headers, userId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });
    const locationId = await createTestLocation({
      name: "Harbor East",
      timezone: "America/New_York",
    });
    await assignManagerToLocation(userId, locationId);
    await createScheduleWeek(locationId, "2025-09-01", "published");

    const actor = await getAuthenticatedUser(headers);
    const result = await getScheduleForLocation(
      locationId,
      "2025-09-01",
      actor!
    );

    expect(result.success).toBe(true);
  });

  it("manager NOT assigned to a location is forbidden", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { createTestLocation, createScheduleWeek } = await import(
      "@/tests/helpers/data"
    );
    const { getScheduleForLocation } = await import(
      "@/server/scheduling/queries"
    );
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    // Setup: manager but NOT assigned to this location
    const { headers } = await createTestUser("manager", {
      firstName: "Jordan",
      lastName: "Lee",
    });
    const locationId = await createTestLocation({
      name: "Harbor West",
      timezone: "America/Los_Angeles",
    });
    await createScheduleWeek(locationId, "2025-09-01", "published");

    const actor = await getAuthenticatedUser(headers);
    const result = await getScheduleForLocation(
      locationId,
      "2025-09-01",
      actor!
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("admin can read any location's schedule", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { createTestLocation, createScheduleWeek } = await import(
      "@/tests/helpers/data"
    );
    const { getScheduleForLocation } = await import(
      "@/server/scheduling/queries"
    );
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers } = await createTestUser("admin", {
      firstName: "Admin",
      lastName: "User",
    });
    const locationId = await createTestLocation({
      name: "Harbor South",
      timezone: "America/New_York",
    });
    await createScheduleWeek(locationId, "2025-09-01", "published");

    const actor = await getAuthenticatedUser(headers);
    const result = await getScheduleForLocation(
      locationId,
      "2025-09-01",
      actor!
    );

    expect(result.success).toBe(true);
  });
});
