import { describe, it, expect } from "vitest";

/**
 * Phase 0 — Pusher Transport Spike
 *
 * Seam: Pusher server-side publisher module.
 * Observable behavior: The publisher authenticates with Pusher using
 * environment credentials and successfully dispatches an event to a
 * test channel without throwing credential or network errors.
 *
 * This does NOT test private-channel client-side auth (that's Slice 5).
 * It only proves we can publish from the server — the outbox path depends on this.
 *
 * Design-spec reference: §2.7 Realtime Architecture with Pusher Channels,
 * §3.25 Outbox for Realtime Reliability, §9 Pusher Spike.
 */

// Codex: create `server/realtime/publisher.ts` exporting:
//   publishEvent(channel: string, event: string, payload: Record<string, unknown>): Promise<void>
//
// It should use the `pusher` npm package (server-side SDK) with credentials
// from environment variables: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER.
//
// The function must reject on credential or network failure and resolve on success.

describe("Pusher transport spike", () => {
  it("can publish an event to a test channel using environment credentials", async () => {
    // This test requires real Pusher credentials in the test environment.
    // It publishes to a throwaway channel and asserts the call resolves
    // without error. The Pusher REST API returns HTTP 200 on success.

    const { publishEvent } = await import("@/server/realtime/publisher");

    // Should not throw — if credentials are wrong or the SDK is misconfigured,
    // this will reject with an authentication or network error.
    await expect(
      publishEvent("test-spike-channel", "spike-event", {
        message: "Phase 0 transport spike",
        timestamp: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });
});
