import { getAuthenticatedUser } from "@/server/auth/session";
import { exportAuditLogsCSV } from "@/server/audit/service";

export async function GET(request: Request) {
  const actor = await getAuthenticatedUser(request.headers);
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const result = await exportAuditLogsCSV({
    locationId: url.searchParams.get("locationId") ?? undefined,
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
  }, actor);
  if (!result.success) {
    const status = result.code.startsWith("INVALID_") ? 400 : result.code === "LOCATION_NOT_FOUND" ? 404 : 403;
    return Response.json({ error: result.code }, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(result.csvContent));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shiftsync-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
