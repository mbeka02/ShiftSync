"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function shiftWeek(weekStart: string, days: number) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function WeekNavigator({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const weekLabel = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  function move(days: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("week", shiftWeek(weekStart, days));
    next.delete("shift");
    router.push(`${pathname}?${next.toString()}`);
  }

  return <div className="flex h-9 items-center border-r border-[var(--border-strong)] pr-3">
    <Button type="button" size="icon-xs" variant="ghost" aria-label="Previous week" onClick={() => move(-7)}><ChevronLeft /></Button>
    <div className="min-w-24 px-1.5 text-center"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">Week of</p><p className="text-sm font-semibold leading-tight">{weekLabel}</p></div>
    <Button type="button" size="icon-xs" variant="ghost" aria-label="Next week" onClick={() => move(7)}><ChevronRight /></Button>
  </div>;
}
