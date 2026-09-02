import type { PoolClient } from "@neondatabase/serverless";

import { closePool, getPool } from "@/server/db/pool";

async function incrementWithLock(client: PoolClient): Promise<void> {
  await client.query("BEGIN");

  try {
    const result = await client.query<{ counter: number }>(
      `SELECT counter
       FROM spike_lock_test
       WHERE id = 1
       FOR UPDATE`,
    );
    const currentCounter = Number(result.rows[0]?.counter);

    if (!Number.isInteger(currentCounter)) {
      throw new Error("The transaction spike seed row is missing.");
    }

    // Keep the row lock briefly so the competing connection must wait.
    await client.query("SELECT pg_sleep(0.1)");
    await client.query(
      "UPDATE spike_lock_test SET counter = $1 WHERE id = 1",
      [currentCounter + 1],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runConcurrentIncrementSpike(): Promise<number> {
  const pool = getPool();
  let client1: PoolClient | undefined;
  let client2: PoolClient | undefined;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spike_lock_test (
        id integer PRIMARY KEY,
        counter integer NOT NULL
      )
    `);
    await pool.query(`
      INSERT INTO spike_lock_test (id, counter)
      VALUES (1, 0)
      ON CONFLICT (id) DO UPDATE SET counter = EXCLUDED.counter
    `);

    [client1, client2] = await Promise.all([pool.connect(), pool.connect()]);
    await Promise.all([
      incrementWithLock(client1),
      incrementWithLock(client2),
    ]);

    const result = await client1.query<{ counter: number }>(
      "SELECT counter FROM spike_lock_test WHERE id = 1",
    );

    return Number(result.rows[0]?.counter);
  } finally {
    client1?.release();
    client2?.release();

    try {
      await pool.query("DROP TABLE IF EXISTS spike_lock_test");
    } finally {
      await closePool();
    }
  }
}
