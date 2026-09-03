import { describe, it, expect } from "vitest";

/**
 * Slice 6 — Filterable Audit History & Streaming Export Authorization
 *
 * Seam: exportAuditLogsCSV(query: { locationId?: string, startDate?: string, endDate?: string }, actor: EnrichedSession)
 *
 * Requirements:
 *   - Managers can export audit logs for locations they manage.
 *   - Managers CANNOT export global audit data without a location filter or for unauthorized locations.
 *   - Admins can export global or filtered audit data.
 *   - Non-managers/non-admins receive forbidden result.
 *
 * Test layer: PostgreSQL integration.
 */

describe("Filterable audit history and streaming export authorization", () => {
  it("allows admin to export global audit logs, allows manager only for assigned location, and denies unauthorized requests", async () => {
    const { createTestUser } = await import("@/tests/helpers/auth");
    const { createTestLocation, assignManagerToLocation } = await import("@/tests/helpers/data");
    const { exportAuditLogsCSV } = await import("@/server/audit/service");
    const { getAuthenticatedUser } = await import("@/server/auth/session");

    const { headers: adminHeaders } = await createTestUser("admin");
    const { headers: managerHeaders, userId: managerId } = await createTestUser("manager");
    const { headers: staffHeaders } = await createTestUser("staff");

    const locationA = await createTestLocation({ name: "Location A" });
    const locationB = await createTestLocation({ name: "Location B" });
    await assignManagerToLocation(managerId, locationA);

    const adminActor = await getAuthenticatedUser(adminHeaders);
    const managerActor = await getAuthenticatedUser(managerHeaders);
    const staffActor = await getAuthenticatedUser(staffHeaders);

    // 1. Admin global export: success
    const adminExport = await exportAuditLogsCSV({}, adminActor!);
    expect(adminExport.success).toBe(true);
    if (adminExport.success) {
      expect(typeof adminExport.csvContent).toBe("string");
    }

    // 2. Manager assigned location export: success
    const managerAllowedExport = await exportAuditLogsCSV({ locationId: locationA }, managerActor!);
    expect(managerAllowedExport.success).toBe(true);

    // 3. Manager global export (no location filter): forbidden
    const managerGlobalExport = await exportAuditLogsCSV({}, managerActor!);
    expect(managerGlobalExport.success).toBe(false);

    // 4. Manager unassigned location export: forbidden
    const managerUnassignedExport = await exportAuditLogsCSV({ locationId: locationB }, managerActor!);
    expect(managerUnassignedExport.success).toBe(false);

    // 5. Staff export: forbidden
    const staffExport = await exportAuditLogsCSV({ locationId: locationA }, staffActor!);
    expect(staffExport.success).toBe(false);
  });
});
