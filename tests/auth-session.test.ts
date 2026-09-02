import { describe, it, expect } from "vitest";

/**
 * Slice 1 — Authentication and Session Enrichment
 *
 * Seam: getAuthenticatedUser(headers: Headers) -> EnrichedSession | null
 *
 * Capability: Better Auth email/password sessions, enriched with
 * user_profiles and user_roles data in a single server call.
 *
 * Observable behavior:
 *   - Valid session headers return enriched user with profile + roles.
 *   - Invalid/missing session headers return null.
 *   - The user.id is a text (Better Auth default Base62 string).
 *
 * Design-spec reference: §2.2.1 Better Auth Configuration, §3.3 Users/Roles.
 * Test layer: PostgreSQL integration (real DB, real Better Auth).
 */

describe("Authentication and session enrichment", () => {
  it("returns enriched session with profile and roles for a valid manager", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers, userId } = await createTestUser("manager", {
      firstName: "Alex",
      lastName: "Rivera",
    });

    const result = await getAuthenticatedUser(headers);

    expect(result).not.toBeNull();
    expect(typeof result!.session.user.id).toBe("string");
    expect(result!.session.user.id).toBe(userId);
    expect(result!.profile?.firstName).toBe("Alex");
    expect(result!.profile?.lastName).toBe("Rivera");
    expect(result!.roles).toContainEqual(
      expect.objectContaining({ code: "manager" })
    );
  });

  it("returns enriched session with staff role and staff profile", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers } = await createTestUser("staff", {
      firstName: "Maria",
      lastName: "Chen",
      desiredWeeklyHours: 30,
      primaryTimezone: "America/New_York",
    });

    const result = await getAuthenticatedUser(headers);

    expect(result).not.toBeNull();
    expect(result!.roles).toContainEqual(
      expect.objectContaining({ code: "staff" })
    );
    // Staff should also have a staff_profile
    expect(result!.staffProfile).not.toBeNull();
    expect(result!.staffProfile?.desiredWeeklyHours).toBe(30);
    expect(result!.staffProfile?.primaryTimezone).toBe("America/New_York");
  });

  it("returns null for invalid/missing session headers", async () => {
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const result = await getAuthenticatedUser(new Headers());

    expect(result).toBeNull();
  });
});
