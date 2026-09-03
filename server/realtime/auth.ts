import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { EnrichedSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  assignments,
  scheduleWeeks,
  shifts,
  staffLocationCertifications,
} from "@/server/db/schema";
import { canManageLocation } from "@/server/scheduling/assignment";
import { getPusher, hasPusherCredentials } from "./publisher";

type ChannelCommand = { socketId: string; channelName: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const denied = (message = "You do not have access to this realtime channel.") => ({
  success: false as const,
  code: "PUSHER_CHANNEL_FORBIDDEN" as const,
  message,
});

async function canStaffAccessLocation(actor: EnrichedSession, locationId: string) {
  if (!actor.roles.some((role) => role.code === "staff")) return false;
  const today = new Date().toISOString().slice(0, 10);
  const [certification] = await db.select({ staffId: staffLocationCertifications.staffId })
    .from(staffLocationCertifications)
    .where(and(
      eq(staffLocationCertifications.staffId, actor.session.user.id),
      eq(staffLocationCertifications.locationId, locationId),
      eq(staffLocationCertifications.status, "active"),
      lte(staffLocationCertifications.validFrom, today),
      or(isNull(staffLocationCertifications.validTo), gte(staffLocationCertifications.validTo, today)),
    ))
    .limit(1);
  return Boolean(certification);
}

function signChannel(command: ChannelCommand) {
  if (!hasPusherCredentials()) {
    return { auth: `development:${command.socketId}:${command.channelName}` };
  }
  return getPusher().authorizeChannel(command.socketId, command.channelName);
}

export async function authorizePusherChannel(command: ChannelCommand, actor: EnrichedSession) {
  if (!command.socketId.trim() || !command.channelName.startsWith("private-")) return denied("The realtime channel request is invalid.");

  if (command.channelName.startsWith("private-user-")) {
    const userId = command.channelName.slice("private-user-".length);
    if (!userId || userId !== actor.session.user.id) return denied();
    return { success: true as const, ...signChannel(command) };
  }

  if (command.channelName.startsWith("private-location-")) {
    const locationId = command.channelName.slice("private-location-".length);
    if (!uuidPattern.test(locationId)) return denied("The location channel is invalid.");
    const authorized = await canManageLocation(db, actor, locationId)
      || await canStaffAccessLocation(actor, locationId);
    if (!authorized) return denied();
    return { success: true as const, ...signChannel(command) };
  }

  if (command.channelName.startsWith("private-schedule-")) {
    const scheduleWeekId = command.channelName.slice("private-schedule-".length);
    if (!uuidPattern.test(scheduleWeekId)) return denied("The schedule channel is invalid.");
    const [week] = await db.select({ locationId: scheduleWeeks.locationId, status: scheduleWeeks.status })
      .from(scheduleWeeks)
      .where(eq(scheduleWeeks.id, scheduleWeekId))
      .limit(1);
    if (!week) return denied();
    if (await canManageLocation(db, actor, week.locationId)) {
      return { success: true as const, ...signChannel(command) };
    }
    if (week.status !== "published" || !actor.roles.some((role) => role.code === "staff")) return denied();
    const [assignment] = await db.select({ id: assignments.id })
      .from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(and(
        eq(shifts.scheduleWeekId, scheduleWeekId),
        eq(shifts.status, "active"),
        eq(assignments.staffId, actor.session.user.id),
        eq(assignments.status, "assigned"),
      ))
      .limit(1);
    if (!assignment) return denied();
    return { success: true as const, ...signChannel(command) };
  }

  return denied("This realtime channel type is not supported.");
}
