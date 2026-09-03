"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/session";
import { clockInStaff, clockOutStaff } from "@/server/onduty/service";
import { deliverOutboxEvent } from "@/server/outbox/service";

const idSchema = z.uuid();
const unauthenticated = () => ({ success: false as const, blockers: [{ code: "UNAUTHENTICATED", severity: "BLOCK" as const, message: "Your session has ended. Sign in and try again.", details: {} }] });
const invalid = () => ({ success: false as const, blockers: [{ code: "INVALID_ON_DUTY_ACTION", severity: "BLOCK" as const, message: "This clock action is no longer available.", details: {} }] });

async function actor() {
  return getAuthenticatedUser(new Headers(await headers()));
}

async function publishCommittedEvent(eventId: string) {
  await deliverOutboxEvent(eventId);
}

export async function clockInStaffAction(command: { assignmentId: string }) {
  const parsed = z.object({ assignmentId: idSchema }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();
  const result = await clockInStaff(parsed.data, authenticated);
  if (result.success) {
    await publishCommittedEvent(result.eventId);
    revalidatePath("/schedule");
  }
  return result;
}

export async function clockOutStaffAction(command: { timeEntryId: string }) {
  const parsed = z.object({ timeEntryId: idSchema }).safeParse(command);
  if (!parsed.success) return invalid();
  const authenticated = await actor();
  if (!authenticated) return unauthenticated();
  const result = await clockOutStaff(parsed.data, authenticated);
  if (result.success) {
    await publishCommittedEvent(result.eventId);
    revalidatePath("/schedule");
  }
  return result;
}
