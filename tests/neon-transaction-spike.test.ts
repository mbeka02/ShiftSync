import { describe, it, expect } from "vitest";

/**
 * Phase 0 — Neon Interactive Transaction Spike
 *
 * Seam: Database transaction helper using Neon Pool/Client over WebSocket.
 * Observable behavior: Two concurrent connections attempting to update the
 * same row via SELECT ... FOR UPDATE serialize correctly — the second
 * connection blocks until the first commits, and neither update is lost.
 *
 * This test proves the infrastructure assumption that Neon supports
 * interactive (multi-statement) transactions with row-level locking.
 * The entire assignment/constraint engine depends on this guarantee.
 *
 * Design-spec reference: §2.4 Database and Transaction Strategy,
 * §2.5 Transaction Boundary for Assignment, §9 Neon Transaction Spike.
 */

describe("Neon interactive transaction spike", () => {
  it("SELECT ... FOR UPDATE serializes concurrent updates to the same row", async () => {
    const { runConcurrentIncrementSpike } = await import(
      "@/server/db/spike"
    );
    const finalCounter = await runConcurrentIncrementSpike();

    expect(finalCounter).toBe(2);
  });
});
