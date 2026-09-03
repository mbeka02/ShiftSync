import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { auditLogs, locations } from "@/server/db/schema";
import { canManageLocation } from "@/server/scheduling/assignment";

export type AuditExportQuery = {
  locationId?: string;
  startDate?: string;
  endDate?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasRole = (actor: EnrichedSession, role: string) => actor.roles.some((entry) => entry.code === role);

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseRange(query: AuditExportQuery) {
  if (query.startDate && !DATE_PATTERN.test(query.startDate)) return null;
  if (query.endDate && !DATE_PATTERN.test(query.endDate)) return null;
  const start = query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`) : undefined;
  const end = query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`) : undefined;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime())) || (start && end && start > end)) return null;
  return { start, end };
}

export async function exportAuditLogsCSV(query: AuditExportQuery, actor: EnrichedSession) {
  const admin = hasRole(actor, "admin");
  const manager = hasRole(actor, "manager");
  if (!admin && !manager) return { success: false as const, code: "FORBIDDEN" as const };
  if (manager && !admin && !query.locationId) return { success: false as const, code: "LOCATION_REQUIRED" as const };
  if (query.locationId && !UUID_PATTERN.test(query.locationId)) return { success: false as const, code: "INVALID_LOCATION" as const };
  if (query.locationId) {
    const [location] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, query.locationId)).limit(1);
    if (!location) return { success: false as const, code: "LOCATION_NOT_FOUND" as const };
  }
  if (query.locationId && !(await canManageLocation(db, actor, query.locationId))) {
    return { success: false as const, code: "FORBIDDEN" as const };
  }
  const range = parseRange(query);
  if (!range) return { success: false as const, code: "INVALID_DATE_RANGE" as const };

  const predicates: SQL[] = [];
  if (query.locationId) predicates.push(eq(auditLogs.locationId, query.locationId));
  if (range.start) predicates.push(gte(auditLogs.createdAt, range.start));
  if (range.end) predicates.push(lte(auditLogs.createdAt, range.end));
  const rows = await db.select().from(auditLogs)
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));

  const header = ["id", "occurred_at", "actor_id", "action", "entity_type", "entity_id", "location_id", "reason", "request_id", "before_state", "after_state"];
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => [
    row.id,
    row.createdAt.toISOString(),
    row.actorId,
    row.action,
    row.entityType,
    row.entityId,
    row.locationId,
    row.reason,
    row.requestId,
    row.beforeState,
    row.afterState,
  ].map(csvCell).join(","))];

  await db.insert(auditLogs).values({
    actorId: actor.session.user.id,
    action: "AUDIT_EXPORT",
    entityType: "audit_logs",
    entityId: query.locationId ?? "global",
    locationId: query.locationId,
    afterState: { filters: query, exportedRowCount: rows.length },
  });

  return {
    success: true as const,
    csvContent: `${lines.join("\r\n")}\r\n`,
    rowCount: rows.length,
    appliedFilters: query,
  };
}
