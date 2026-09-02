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
} from "@/server/coverage/service";

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

export async function createSwapRequestAction(command: { shiftId: string; targetStaffId: string; reason?: string }) {
  const parsed = z.object({ shiftId: idSchema, targetStaffId: z.string().min(1), reason: reasonSchema }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();
  const result = await createSwapRequest(parsed.data, authenticated);
  if (result.success) refreshCoverage();
  return result;
}

export async function createDropRequestAction(command: { shiftId: string; reason?: string }) {
  const parsed = z.object({ shiftId: idSchema, reason: reasonSchema }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();
  const result = await createDropRequest(parsed.data, authenticated);
  if (result.success) refreshCoverage();
  return result;
}

export async function transitionCoverageRequestAction(command: {
  requestId: string;
  action: "accept-swap" | "claim-drop" | "approve-swap" | "approve-drop" | "cancel";
}) {
  const parsed = z.object({
    requestId: idSchema,
    action: z.enum(["accept-swap", "claim-drop", "approve-swap", "approve-drop", "cancel"]),
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
          : await cancelCoverageRequest(parsed.data.requestId, authenticated);
  if (result.success) refreshCoverage();
  return result;
}
