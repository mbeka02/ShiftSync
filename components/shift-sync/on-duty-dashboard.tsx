"use client";

import { useCallback, useTransition } from "react";
import { Clock3, LogIn, LogOut, Radio, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clockInStaffAction, clockOutStaffAction } from "@/app/(dashboard)/schedule/on-duty-actions";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/hooks/use-realtime";

const ON_DUTY_EVENTS = ["onduty.clock_in", "onduty.clock_out"] as const;

type OpenEntry = {
  timeEntryId: string;
  assignmentId: string;
  clockInAt: string;
} | null;

export function StaffOnDutyControl({ assignmentId, canClockIn, openEntry }: { assignmentId: string; canClockIn: boolean; openEntry: OpenEntry }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onThisShift = openEntry?.assignmentId === assignmentId;
  const onAnotherShift = Boolean(openEntry && !onThisShift);

  function changeDutyState() {
    startTransition(async () => {
      const result = onThisShift && openEntry
        ? await clockOutStaffAction({ timeEntryId: openEntry.timeEntryId })
        : await clockInStaffAction({ assignmentId });
      if (!result.success) {
        toast.error(onThisShift ? "Clock-out failed" : "Clock-in failed", { description: result.blockers[0]?.message });
        return;
      }
      toast.success(onThisShift ? "Clocked out" : "Clocked in", {
        description: onThisShift ? "Your on-duty entry is closed." : "Managers can now see you on duty.",
      });
      router.refresh();
    });
  }

  if (onThisShift) {
    return <div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--success-fg)]"><span className="size-1.5 bg-[var(--success-fg)]" />On duty</span><Button size="xs" variant="outline" onClick={changeDutyState} disabled={pending}><LogOut className="size-3" />{pending ? "Clocking out…" : "Clock out"}</Button></div>;
  }
  return <Button size="xs" onClick={changeDutyState} disabled={pending || onAnotherShift || !canClockIn} title={onAnotherShift ? "Clock out of your current shift first." : !canClockIn ? "This shift has ended." : undefined}><LogIn className="size-3" />{pending ? "Clocking in…" : onAnotherShift ? "On duty elsewhere" : !canClockIn ? "Shift ended" : "Clock in"}</Button>;
}

export type OnDutyStaffView = {
  timeEntryId: string;
  assignmentId: string;
  staffId: string;
  staffName: string;
  skillName: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
  clockInAt: string;
  timing: "early" | "on_time" | "late";
};

export function OnDutyDashboard({ locationId, timezone, staff }: { locationId: string; timezone: string; staff: OnDutyStaffView[] }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const realtime = useRealtime(`private-location-${locationId}`, ON_DUTY_EVENTS, refresh);
  const time = (value: string) => new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });

  return <section className="mt-8 border bg-white" aria-labelledby="on-duty-heading">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Floor status</p><h2 id="on-duty-heading" className="font-heading text-xl uppercase tracking-wide">On duty now</h2></div>
      <div className={`inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] ${realtime === "live" ? "text-[var(--success-fg)]" : "text-muted-foreground"}`} title={realtime === "live" ? "Updates arrive automatically." : "Reconnect or refresh for the latest state."}>
        <Radio className={`size-3.5 ${realtime === "connecting" ? "animate-pulse" : ""}`} />{realtime === "live" ? "Live" : realtime === "connecting" ? "Connecting" : "Refresh to update"}
      </div>
    </div>
    {staff.length ? <div className="divide-y" aria-live="polite">{staff.map((person) => <article key={person.timeEntryId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0"><p className="text-sm font-semibold">{person.staffName}</p><p className="mt-0.5 text-xs text-muted-foreground">{person.skillName}</p></div>
      <div><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Scheduled</p><p className="mt-1 text-xs">{time(person.shiftStartsAt)}–{time(person.shiftEndsAt)}</p></div>
      <div className="sm:min-w-36 sm:text-right"><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--success-fg)]">Clocked in {time(person.clockInAt)}</p>{person.timing !== "on_time" ? <p className="mt-1 text-[11px] text-[var(--warning-fg)]">{person.timing === "early" ? "Early clock-in" : "Late clock-in"}</p> : <p className="mt-1 text-[11px] text-muted-foreground">Within start window</p>}</div>
    </article>)}</div> : <div className="px-6 py-10 text-center"><UserRoundCheck className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm font-semibold">No one is clocked in</p><p className="mt-1 text-xs text-muted-foreground">Scheduled staff appear here after they clock in.</p></div>}
    <div className="flex items-center gap-2 border-t bg-[var(--surface-subtle)] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"><Clock3 className="size-3" />Times shown in {timezone}</div>
  </section>;
}
