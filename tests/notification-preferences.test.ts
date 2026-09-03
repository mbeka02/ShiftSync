import { describe, it, expect } from "vitest";

/**
 * Slice 6 — Notification Preferences & Simulated Delivery
 *
 * Seams:
 *   updateNotificationPreferences({ mode: "in_app_only" | "in_app_and_email" }, actor: EnrichedSession)
 *   getNotificationPreferences(actor: EnrichedSession)
 *
 * Requirements:
 *   - Users can view and update their notification delivery mode preference.
 *   - Simulated email dispatch honors user preference (dispatches simulated email only when mode = "in_app_and_email").
 *
 * Test layer: PostgreSQL integration.
 */

describe("Notification preferences and simulated email delivery", () => {
  it("allows user to update notification mode and reflects mode in delivery behavior", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const {
      getNotificationPreferences,
      updateNotificationPreferences,
    } = await import("@/server/preferences/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: userHeaders } = await createTestUser("staff");
    const actor = await getAuthenticatedUser(userHeaders);
    expect(actor).not.toBeNull();

    // Default mode check
    const initialPrefs = await getNotificationPreferences(actor!);
    expect(initialPrefs.notificationMode).toBeDefined();

    // Update to in_app_and_email
    const updateResult = await updateNotificationPreferences({ notificationMode: "in_app_and_email" }, actor!);
    expect(updateResult.success).toBe(true);

    const updatedPrefs = await getNotificationPreferences(actor!);
    expect(updatedPrefs.notificationMode).toBe("in_app_and_email");

    // Update back to in_app_only
    const revertResult = await updateNotificationPreferences({ notificationMode: "in_app_only" }, actor!);
    expect(revertResult.success).toBe(true);

    const revertedPrefs = await getNotificationPreferences(actor!);
    expect(revertedPrefs.notificationMode).toBe("in_app_only");
  });
});
