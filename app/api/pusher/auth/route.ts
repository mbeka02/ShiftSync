import { getAuthenticatedUser } from "@/server/auth/session";
import { authorizePusherChannel } from "@/server/realtime/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await getAuthenticatedUser(new Headers(request.headers));
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid channel authorization request." }, { status: 400 });
  }
  const socketId = formData.get("socket_id");
  const channelName = formData.get("channel_name");
  if (typeof socketId !== "string" || typeof channelName !== "string") {
    return Response.json({ error: "socket_id and channel_name are required." }, { status: 400 });
  }

  const result = await authorizePusherChannel({ socketId, channelName }, actor);
  if (!result.success) return Response.json({ error: result.message }, { status: 403 });
  return Response.json({ auth: result.auth });
}
