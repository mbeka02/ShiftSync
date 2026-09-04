import { isDemoRefreshRequestAuthorized, refreshDemoScheduleFixtures } from "@/server/demo/refresh";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authorized = isDemoRefreshRequestAuthorized({
    authorization: request.headers.get("authorization"),
    branch: process.env.NEON_BRANCH,
    enabled: process.env.DEMO_REFRESH_ENABLED,
    cronSecret: process.env.CRON_SECRET,
  });
  if (!authorized) return Response.json({ success: false }, { status: 401 });

  try {
    const result = await refreshDemoScheduleFixtures();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Demo schedule refresh failed.", error);
    return Response.json({ success: false }, { status: 500 });
  }
}
