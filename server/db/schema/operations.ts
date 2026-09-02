import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const outboxStatus = pgEnum("outbox_status", ["pending", "delivered", "failed"]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: text("actor_id").notNull().references(() => user.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
  afterState: jsonb("after_state").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_logs_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
  index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  link: text("link"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("notifications_user_read_created_idx").on(table.userId, table.read, table.createdAt)]);

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  channel: text("channel").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: outboxStatus("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [index("outbox_events_status_created_idx").on(table.status, table.createdAt)]);
