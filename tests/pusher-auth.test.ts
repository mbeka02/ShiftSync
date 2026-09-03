import { describe, it, expect } from "vitest";

/**
 * Slice 5 — Pusher Channel Authorization Seam
 *
 * Seam: authorizePusherChannel({ socketId, channelName }, actor) -> { auth: string } | null
 *
 * Channel patterns:
 *   - private-user-{userId}: Staff/Manager can only subscribe to their own user channel.
 *   - private-location-{locationId}: Managers/Staff certified or managing that location can subscribe.
 *   - private-schedule-{scheduleWeekId}: Authorized managers/staff for the location can subscribe.
 *
 * Test layer: PostgreSQL integration + session authorization.
 */

describe("Pusher private channel authorization", () => {
  it("authorizes user to their own private user channel, rejects for another user channel", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { authorizePusherChannel } = await import("@/server/realtime/auth");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: userAHeaders, userId: userAId } = await createTestUser("staff", {
      firstName: "User",
      lastName: "Alpha",
    });
    const { userId: userBId } = await createTestUser("staff", {
      firstName: "User",
      lastName: "Beta",
    });

    const actorA = await getAuthenticatedUser(userAHeaders);
    expect(actorA).not.toBeNull();

    // 1. Own user channel: should succeed
    const ownAuth = await authorizePusherChannel(
      { socketId: "123.456", channelName: `private-user-${userAId}` },
      actorA!
    );
    expect(ownAuth.success).toBe(true);
    if (ownAuth.success) {
      expect(ownAuth.auth).toBeDefined();
    }

    // 2. Another user channel: should be forbidden
    const foreignAuth = await authorizePusherChannel(
      { socketId: "123.456", channelName: `private-user-${userBId}` },
      actorA!
    );
    expect(foreignAuth.success).toBe(false);
  });

  it("authorizes manager for assigned location channel and rejects unassigned location", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { createTestLocation, assignManagerToLocation } = await import("@/tests/helpers/data");
    const { authorizePusherChannel } = await import("@/server/realtime/auth");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Manager",
    });

    const locationA = await createTestLocation({ name: "Downtown Grill", timezone: "America/New_York" });
    const locationB = await createTestLocation({ name: "Uptown Bistro", timezone: "America/New_York" });

    await assignManagerToLocation(managerId, locationA);

    const managerActor = await getAuthenticatedUser(managerHeaders);

    // Authorized location channel
    const authA = await authorizePusherChannel(
      { socketId: "123.456", channelName: `private-location-${locationA}` },
      managerActor!
    );
    expect(authA.success).toBe(true);

    // Unassigned location channel
    const authB = await authorizePusherChannel(
      { socketId: "123.456", channelName: `private-location-${locationB}` },
      managerActor!
    );
    expect(authB.success).toBe(false);
  });
});
