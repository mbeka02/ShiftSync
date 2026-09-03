import { MapPin, UtensilsCrossed } from "lucide-react";
import { SignOutButton } from "./sign-out-button";
import { NotificationCenter } from "./notification-center";
import { NotificationPreferenceControl } from "./notification-preference-control";
import { AppNav } from "./app-nav";
import type { NotificationMode } from "@/server/db/schema";

type Props = {
  children: React.ReactNode;
  name: string;
  role: string;
  locationName: string;
  timezone: string;
  notifications: Array<{ id: string; type: string; title: string; message: string; read: boolean; link: string | null; createdAt: string }>;
  notificationMode: NotificationMode;
};

export function AppShell({ children, name, role, locationName, timezone, notifications, notificationMode }: Props) {
  const manager = role === "manager" || role === "admin";
  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[14rem_1fr]">
      <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5"><p className="font-heading text-xl uppercase tracking-[0.08em]">ShiftSync</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Coastal Eats</p></div>
        <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-5"><AppNav manager={manager} admin={role === "admin"} /></nav>
        <div className="border-t border-sidebar-border p-3"><div className="px-3 py-3"><p className="truncate text-sm font-semibold">{name}</p><p className="mt-0.5 text-xs capitalize text-white/55">{role}</p></div><SignOutButton /></div>
      </aside>
      <div className="min-w-0 pb-16 md:pb-0">
        <header className="flex min-h-16 items-center justify-between border-b bg-white px-4 sm:px-6 lg:px-8"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold"><MapPin className="size-4 text-primary" />{locationName}</p><p className="ml-6 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{timezone}</p></div><div className="flex items-center gap-1"><span className="hidden items-center gap-2 pr-1 text-xs font-medium text-muted-foreground sm:flex"><UtensilsCrossed className="size-4" />Service workspace</span><NotificationPreferenceControl initialMode={notificationMode} /><NotificationCenter notifications={notifications} /></div></header>
        <main>{children}</main>
      </div>
      <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t bg-[var(--color-deep-water)] text-white md:hidden"><AppNav manager={manager} admin={role === "admin"} mobile /><div className="w-28"><SignOutButton /></div></nav>
    </div>
  );
}
