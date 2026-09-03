import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { drainOutboxEvents } from "@/server/outbox/service";

function authorized(request: Request) {
  const configured = process.env.OUTBOX_DRAIN_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await drainOutboxEvents({ limit: 50 });
  return NextResponse.json(result);
}
