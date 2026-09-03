import { beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { outboxEvents } from "@/server/db/schema";
import { assertTestDatabaseEnvironment } from "@/server/db/test-guard";

beforeAll(async () => {
  assertTestDatabaseEnvironment();
  await db.update(outboxEvents)
    .set({ status: "delivered", deliveredAt: new Date() })
    .where(eq(outboxEvents.status, "pending"));
});
