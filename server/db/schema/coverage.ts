import { check, index, pgEnum, pgTable, text, timestamp, uuid, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { shifts } from "./scheduling";
import { staffProfiles } from "./users";

export const coverageRequestType = pgEnum("coverage_request_type", ["swap", "drop"]);
export const coverageRequestStatus = pgEnum("coverage_request_status", [
  "open",
  "pending_target",
  "accepted_by_target",
  "claimed",
  "approved",
  "cancelled",
  "rejected",
  "expired",
]);

export const coverageRequests = pgTable("coverage_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  requesterStaffId: text("requester_staff_id").notNull().references(() => staffProfiles.userId),
  targetStaffId: text("target_staff_id").references(() => staffProfiles.userId),
  claimantStaffId: text("claimant_staff_id").references(() => staffProfiles.userId),
  type: coverageRequestType("type").notNull(),
  status: coverageRequestStatus("status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
}, (table) => [
  index("coverage_requests_shift_status_idx").on(table.shiftId, table.status),
  index("coverage_requests_requester_status_idx").on(table.requesterStaffId, table.status),
  index("coverage_requests_target_status_idx").on(table.targetStaffId, table.status),
  index("coverage_requests_claimant_status_idx").on(table.claimantStaffId, table.status),
  check("coverage_requests_participants_check", sql`
    (${table.type} = 'swap' and ${table.targetStaffId} is not null and ${table.claimantStaffId} is null)
    or (${table.type} = 'drop' and ${table.targetStaffId} is null)
  `),
]);
