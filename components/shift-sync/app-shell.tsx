import Link from "next/link";
import { CalendarDays, MapPin, ShieldCheck, UsersRound, UtensilsCrossed } from "lucide-react";
import { SignOutButton } from "./sign-out-button";

type Props = {
  children: React.ReactNode;
  name: string;
  role: string;
  locationName: string;
  timezone: string;
};

export function AppShell({ children, name, role, locationName, timezone }: Props) {
  const manager = role === "manager" || role === "admin";
  const nav = [
    { label: "Schedule", icon: CalendarDays, active: true },
    ...(manager ? [{ label: "Team", icon: UsersRound, active: false }] : []),
    ...(role === "admin" ? [{ label: "Access", icon: ShieldCheck, active: false }] : []),
  ];
  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[14rem_1fr]">
      <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5"><p className="font-heading text-xl uppercase tracking-[0.08em]">ShiftSync</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Coastal Eats</p></div>
        <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-5">{nav.map(({ label, icon: Icon, active }) => active ? <Link key={label} href="/schedule" aria-current="page" className="flex min-h-11 items-center gap-3 border-l-2 border-[#84c8bf] bg-sidebar-accent px-3 text-sm font-semibold"><Icon className="size-4" />{label}</Link> : <span key={label} aria-disabled className="flex min-h-11 items-center gap-3 px-3 text-sm text-white/40"><Icon className="size-4" />{label}<span className="ml-auto font-mono text-[9px] uppercase">Soon</span></span>)}</nav>
        <div className="border-t border-sidebar-border p-3"><div className="px-3 py-3"><p className="truncate text-sm font-semibold">{name}</p><p className="mt-0.5 text-xs capitalize text-white/55">{role}</p></div><SignOutButton /></div>
      </aside>
      <div className="min-w-0 pb-16 md:pb-0">
        <header className="flex min-h-16 items-center justify-between border-b bg-white px-4 sm:px-6 lg:px-8"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold"><MapPin className="size-4 text-primary" />{locationName}</p><p className="ml-6 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{timezone}</p></div><span className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex"><UtensilsCrossed className="size-4" />Service workspace</span></header>
        <main>{children}</main>
      </div>
      <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t bg-[var(--color-deep-water)] text-white md:hidden"><Link href="/schedule" className="flex min-h-11 min-w-20 flex-col items-center justify-center gap-1 text-xs font-semibold"><CalendarDays className="size-5" />Schedule</Link><div className="w-28"><SignOutButton /></div></nav>
    </div>
  );
}
