import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shift-sync/app-shell";
import { getAuthenticatedUser } from "@/server/auth/session";
import { getAccessibleLocations } from "@/server/scheduling/queries";
import { getNotifications } from "@/server/notifications/service";
import { getNotificationPreferences } from "@/server/preferences/service";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) redirect("/login");
  const role = actor.roles.find((item) => ["admin", "manager", "staff"].includes(item.code))?.code ?? "staff";
  const [availableLocations, notificationRows, preferences] = await Promise.all([
    getAccessibleLocations(actor),
    getNotifications(actor),
    getNotificationPreferences(actor),
  ]);
  const location = availableLocations[0];
  const name = actor.profile ? `${actor.profile.firstName} ${actor.profile.lastName}` : actor.session.user.name;
  const notifications = notificationRows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
  const realtimeChannels = [
    `private-user-${actor.session.user.id}`,
    ...availableLocations.map((item) => `private-location-${item.id}`),
  ];
  return <AppShell name={name} role={role} locationName={location?.name ?? (role === "staff" ? "My published schedule" : "No assigned location")} timezone={location?.timezone ?? actor.staffProfile?.primaryTimezone ?? "Timezone unavailable"} locations={availableLocations} notifications={notifications} notificationMode={preferences.notificationMode} realtimeChannels={realtimeChannels}>{children}</AppShell>;
}
