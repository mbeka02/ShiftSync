"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, ShieldCheck, UsersRound } from "lucide-react";

export function AppNav({ manager, admin, mobile = false }: { manager: boolean; admin: boolean; mobile?: boolean }) {
  const pathname = usePathname();
  const links = [
    { label: "Schedule", href: "/schedule", icon: CalendarDays, enabled: true },
    ...(manager ? [{ label: "Analytics", href: "/analytics", icon: BarChart3, enabled: true }] : []),
    ...(manager && !mobile ? [{ label: "Team", href: "#", icon: UsersRound, enabled: false }] : []),
    ...(admin && !mobile ? [{ label: "Access", href: "#", icon: ShieldCheck, enabled: false }] : []),
  ];
  if (mobile) {
    return <>{links.map(({ label, href, icon: Icon }) => <Link key={label} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined} className={`flex min-h-11 min-w-20 flex-col items-center justify-center gap-1 text-xs font-semibold ${pathname.startsWith(href) ? "text-[#84c8bf]" : "text-white"}`}><Icon className="size-5" />{label}</Link>)}</>;
  }
  return <>{links.map(({ label, href, icon: Icon, enabled }) => enabled ? <Link key={label} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined} className={`flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm font-semibold ${pathname.startsWith(href) ? "border-[#84c8bf] bg-sidebar-accent" : "border-transparent text-white/70 hover:bg-sidebar-accent hover:text-white"}`}><Icon className="size-4" />{label}</Link> : <span key={label} aria-disabled className="flex min-h-11 items-center gap-3 px-3 text-sm text-white/40"><Icon className="size-4" />{label}<span className="ml-auto font-mono text-[9px] uppercase">Soon</span></span>)}</>;
}
