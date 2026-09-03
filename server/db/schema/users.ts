import { sql } from "drizzle-orm";
import { check, date, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const profileStatus = pgEnum("profile_status", ["active", "inactive"]);
export const notificationMode = pgEnum("notification_mode", ["in_app_only", "in_app_and_email"]);

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  status: profileStatus("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
}, (table) => [check("roles_code_check", sql`${table.code} in ('admin', 'manager', 'staff')`)]);

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId),
]);

export const staffProfiles = pgTable("staff_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  desiredWeeklyHours: numeric("desired_weekly_hours", { mode: "number", precision: 5, scale: 2 }).default(0).notNull(),
  primaryTimezone: text("primary_timezone").notNull(),
  employmentStartDate: date("employment_start_date", { mode: "string" }).notNull(),
  employmentEndDate: date("employment_end_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("staff_employment_dates_check", sql`${table.employmentEndDate} is null or ${table.employmentEndDate} >= ${table.employmentStartDate}`)]);

export const staffCompensation = pgTable("staff_compensation", {
  staffId: text("staff_id").notNull().references(() => staffProfiles.userId, { onDelete: "cascade" }),
  hourlyRate: numeric("hourly_rate", { mode: "number", precision: 10, scale: 2 }).notNull(),
  overtimeMultiplier: numeric("overtime_multiplier", { mode: "number", precision: 5, scale: 2 }).default(1.5).notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  effectiveTo: date("effective_to", { mode: "string" }),
}, (table) => [
  primaryKey({ columns: [table.staffId, table.effectiveFrom] }),
  check("staff_compensation_rate_positive_check", sql`${table.hourlyRate} >= 0`),
  check("staff_compensation_multiplier_check", sql`${table.overtimeMultiplier} >= 1`),
  check("staff_compensation_dates_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  notificationMode: notificationMode("notification_mode").default("in_app_only").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RoleCode = "admin" | "manager" | "staff";
export type NotificationMode = "in_app_only" | "in_app_and_email";
