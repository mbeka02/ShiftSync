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

// The implementation should export these from a shared db module,
// e.g. `server/db/index.ts` or `server/db/pool.ts`.
// Codex: create the pool/client setup using @neondatabase/serverless
// and export a `getPool()` or equivalent that returns a Pool connected
// via WebSocket (not the HTTP-only neon() helper).

describe("Neon interactive transaction spike", () => {
  it("SELECT ... FOR UPDATE serializes concurrent updates to the same row", async () => {
    // This test requires:
    // 1. A real Neon database connection (use the test branch/database).
    // 2. A `spike_lock_test` table with columns (id int primary key, counter int).
    // 3. A seed row: INSERT INTO spike_lock_test (id, counter) VALUES (1, 0);
    //
    // The test opens two independent connections (client1, client2) from Pool.
    // Both attempt to:
    //   BEGIN;
    //   SELECT counter FROM spike_lock_test WHERE id = 1 FOR UPDATE;
    //   -- read current value
    //   UPDATE spike_lock_test SET counter = <read_value + 1> WHERE id = 1;
    //   COMMIT;
    //
    // If locking works, the final counter value must be exactly 2 (both
    // increments applied serially). If locking does NOT work, both would
    // read 0 and write 1, leaving counter = 1.

    // Codex: implement `runConcurrentIncrementSpike()` in server/db/spike.ts
    // It should:
    //   - Create the spike_lock_test table if not exists
    //   - Insert/reset the seed row to counter = 0
    //   - Open two clients from Pool
    //   - Race both increment transactions using Promise.all
    //   - Return the final counter value after both complete
    //   - Clean up (drop the table or reset)

    const { runConcurrentIncrementSpike } = await import(
      "@/server/db/spike"
    );
    const finalCounter = await runConcurrentIncrementSpike();

    // If Neon interactive transactions + FOR UPDATE work correctly,
    // the counter must be exactly 2 (serialized increments).
    expect(finalCounter).toBe(2);
  });
});
