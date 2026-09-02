import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shift-sync/app-shell";
import { getAuthenticatedUser } from "@/server/auth/session";
import { getAccessibleLocations } from "@/server/scheduling/queries";
import { getNotifications } from "@/server/notifications/service";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) redirect("/login");
  const role = actor.roles.find((item) => ["admin", "manager", "staff"].includes(item.code))?.code ?? "staff";
  const [availableLocations, notificationRows] = await Promise.all([
    role === "staff" ? Promise.resolve([]) : getAccessibleLocations(actor),
    getNotifications(actor),
  ]);
  const location = availableLocations[0];
  const name = actor.profile ? `${actor.profile.firstName} ${actor.profile.lastName}` : actor.session.user.name;
  const notifications = notificationRows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
  return <AppShell name={name} role={role} locationName={location?.name ?? (role === "staff" ? "My published schedule" : "No assigned location")} timezone={location?.timezone ?? actor.staffProfile?.primaryTimezone ?? "Timezone unavailable"} notifications={notifications}>{children}</AppShell>;
}
