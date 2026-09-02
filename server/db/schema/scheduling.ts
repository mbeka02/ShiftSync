import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgEnum, pgTable, primaryKey, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { staffProfiles } from "./users";

export const scheduleStatus = pgEnum("schedule_status", ["draft", "published"]);
export const shiftStatus = pgEnum("shift_status", ["active", "cancelled"]);
export const assignmentStatus = pgEnum("assignment_status", ["assigned", "removed", "cancelled"]);

export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  timezone: text("timezone").notNull(),
  schedulingCutoffMinutes: integer("scheduling_cutoff_minutes").default(2880).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("locations_cutoff_nonnegative_check", sql`${table.schedulingCutoffMinutes} >= 0`)]);

export const managerLocations = pgTable("manager_locations", {
  managerUserId: text("manager_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validTo: date("valid_to", { mode: "string" }),
}, (table) => [
  primaryKey({ columns: [table.managerUserId, table.locationId, table.validFrom] }),
  check("manager_location_dates_check", sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`),
]);

export const scheduleWeeks = pgTable("schedule_weeks", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  weekStartDate: date("week_start_date", { mode: "string" }).notNull(),
  status: scheduleStatus("status").default("draft").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: text("published_by").references(() => user.id),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("schedule_weeks_location_week_unique").on(table.locationId, table.weekStartDate),
  index("schedule_weeks_status_idx").on(table.status),
]);

export const skills = pgTable("skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
});

export const shifts = pgTable("shifts", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleWeekId: uuid("schedule_week_id").notNull().references(() => scheduleWeeks.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  requiredSkillId: uuid("required_skill_id").notNull().references(() => skills.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull(),
  localStartDate: date("local_start_date", { mode: "string" }).notNull(),
  localStartTime: time("local_start_time").notNull(),
  localEndDate: date("local_end_date", { mode: "string" }).notNull(),
  localEndTime: time("local_end_time").notNull(),
  headcount: integer("headcount").default(1).notNull(),
  premium: boolean("premium").default(false).notNull(),
  status: shiftStatus("status").default("active").notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by").notNull().references(() => user.id),
}, (table) => [
  check("shifts_time_order_check", sql`${table.endsAt} > ${table.startsAt}`),
  check("shifts_headcount_positive_check", sql`${table.headcount} >= 1`),
  index("shifts_week_idx").on(table.scheduleWeekId),
]);

export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  staffId: text("staff_id").notNull().references(() => staffProfiles.userId),
  status: assignmentStatus("status").default("assigned").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  assignedBy: text("assigned_by").notNull().references(() => user.id),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  removedBy: text("removed_by").references(() => user.id),
  managerOverride: boolean("manager_override").default(false).notNull(),
  overrideReason: text("override_reason"),
  riskFlags: text("risk_flags").array().default(sql`'{}'::text[]`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("assignments_active_shift_staff_unique").on(table.shiftId, table.staffId).where(sql`${table.status} = 'assigned'`),
  index("assignments_staff_idx").on(table.staffId),
  check("assignments_override_reason_check", sql`not ${table.managerOverride} or ${table.overrideReason} is not null`),
]);
