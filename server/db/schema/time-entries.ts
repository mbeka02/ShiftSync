import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { assignments, locations } from "./scheduling";

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  staffId: text("staff_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  clockInAt: timestamp("clock_in_at", { withTimezone: true }).defaultNow().notNull(),
  clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("time_entries_open_assignment_unique")
    .on(table.assignmentId)
    .where(sql`${table.clockOutAt} is null`),
  uniqueIndex("time_entries_open_staff_unique")
    .on(table.staffId)
    .where(sql`${table.clockOutAt} is null`),
  index("time_entries_location_open_clock_in_idx")
    .on(table.locationId, table.clockOutAt, table.clockInAt),
]);
