"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/session";
import {
  acceptSwapRequest,
  approveDropRequest,
  approveSwapRequest,
  cancelCoverageRequest,
  claimDropRequest,
  createDropRequest,
  createSwapRequest,
  rejectCoverageRequest,
} from "@/server/coverage/service";
import { deliverOutboxEvent } from "@/server/outbox/service";

const idSchema = z.uuid();
const reasonSchema = z.string().trim().max(500).optional();
const unauthenticated = () => ({ success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] });
const invalid = () => ({ success: false as const, blockers: [{ code: "INVALID_COVERAGE_REQUEST", severity: "BLOCK" as const, message: "This coverage request is invalid or no longer available.", details: {} }] });

async function actor() {
  return getAuthenticatedUser(new Headers(await headers()));
}

function refreshCoverage() {
  revalidatePath("/schedule");
}

async function deliverCoverageEvents(result: unknown) {
  if (typeof result !== "object" || result === null || !("eventIds" in result) || !Array.isArray(result.eventIds)) return;
  await Promise.allSettled(result.eventIds.map((eventId) => deliverOutboxEvent(String(eventId))));
}

export async function createSwapRequestAction(command: { shiftId: string; targetStaffId: string; reason?: string }) {
  const parsed = z.object({ shiftId: idSchema, targetStaffId: z.string().min(1), reason: reasonSchema }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();
  const result = await createSwapRequest(parsed.data, authenticated);
  await deliverCoverageEvents(result);
  if (result.success) refreshCoverage();
  return result;
}

export async function createDropRequestAction(command: { shiftId: string; reason?: string }) {
  const parsed = z.object({ shiftId: idSchema, reason: reasonSchema }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();
  const result = await createDropRequest(parsed.data, authenticated);
  await deliverCoverageEvents(result);
  if (result.success) refreshCoverage();
  return result;
}

export async function transitionCoverageRequestAction(command: {
  requestId: string;
  action: "accept-swap" | "claim-drop" | "approve-swap" | "approve-drop" | "reject" | "cancel";
}) {
  const parsed = z.object({
    requestId: idSchema,
    action: z.enum(["accept-swap", "claim-drop", "approve-swap", "approve-drop", "reject", "cancel"]),
  }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();

  const result = parsed.data.action === "accept-swap"
    ? await acceptSwapRequest(parsed.data.requestId, authenticated)
    : parsed.data.action === "claim-drop"
      ? await claimDropRequest(parsed.data.requestId, authenticated)
      : parsed.data.action === "approve-swap"
        ? await approveSwapRequest(parsed.data.requestId, authenticated)
        : parsed.data.action === "approve-drop"
          ? await approveDropRequest(parsed.data.requestId, authenticated)
          : parsed.data.action === "reject"
            ? await rejectCoverageRequest(parsed.data.requestId, authenticated)
            : await cancelCoverageRequest(parsed.data.requestId, authenticated);
  await deliverCoverageEvents(result);
  if (result.success) refreshCoverage();
  return result;
}
