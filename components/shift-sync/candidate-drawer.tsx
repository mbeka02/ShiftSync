"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock3, ShieldX, UserRoundCheck } from "lucide-react";
import { assignStaffAction } from "@/app/(dashboard)/schedule/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Violation = { code: string; severity: "BLOCK" | "WARNING"; message: string; details: Record<string, unknown> };
type Candidate = {
  staffId: string;
  name: string;
  blockers: Violation[];
  warnings: Violation[];
  impact: { projectedDailyHours: number; projectedWeeklyHours: number; projectedConsecutiveDays: number; overtime: boolean };
};

export function CandidateDrawer({ shift, candidates, returnHref }: {
  shift: { id: string; startsAt: string; endsAt: string; timezone: string };
  candidates: Candidate[];
  returnHref: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(candidates[0]?.staffId ?? null);
  const [serverBlockers, setServerBlockers] = useState<Violation[]>([]);
  const [pending, startTransition] = useTransition();
  const selected = useMemo(() => candidates.find((candidate) => candidate.staffId === selectedId), [candidates, selectedId]);
  const time = new Date(shift.startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: shift.timezone });

  function assign() {
    if (!selected) return;
    setServerBlockers([]);
    startTransition(async () => {
      const result = await assignStaffAction({ shiftId: shift.id, staffId: selected.staffId });
      if (!result.success) {
        setServerBlockers(result.blockers);
        router.refresh();
        return;
      }
      router.replace(returnHref);
      router.refresh();
    });
  }

  return <Sheet open onOpenChange={(open) => { if (!open) router.replace(returnHref); }}>
    <SheetContent className="w-full sm:max-w-xl" side="right">
      <SheetHeader className="border-b px-5 py-5 pr-14 sm:px-6"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Assignment preview</p><SheetTitle className="text-2xl">Choose staff</SheetTitle><SheetDescription><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{time} · {shift.timezone}</span></SheetDescription></SheetHeader>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="overflow-y-auto border-r p-3 sm:p-4"><p className="mb-3 text-xs font-semibold text-muted-foreground">{candidates.length} staff reviewed against current schedule</p><div className="space-y-2">
          {candidates.map((candidate) => {
            const blocked = candidate.blockers.length > 0;
            const warning = !blocked && candidate.warnings.length > 0;
            return <button key={candidate.staffId} type="button" onClick={() => { setSelectedId(candidate.staffId); setServerBlockers([]); }} aria-pressed={candidate.staffId === selectedId} className="grid min-h-20 w-full grid-cols-[1fr_auto] items-center gap-3 border bg-white p-3 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-[var(--surface-subtle)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{candidate.name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{candidate.impact.projectedWeeklyHours}h projected · {candidate.impact.projectedConsecutiveDays} day streak</p><p className="mt-1 truncate text-xs text-muted-foreground">{blocked ? candidate.blockers[0].message : warning ? candidate.warnings[0].message : "Qualified, available, and rested"}</p></div><span className={blocked ? "text-[var(--danger-fg)]" : warning ? "text-[var(--warning-fg)]" : "text-[var(--success-fg)]"}>{blocked ? <ShieldX className="size-5" /> : warning ? <AlertTriangle className="size-5" /> : <Check className="size-5" />}</span></button>;
          })}
          {!candidates.length ? <div className="border border-dashed p-6 text-center"><p className="font-semibold">No staff profiles found</p><p className="mt-1 text-xs text-muted-foreground">Add staff qualifications before assigning this shift.</p></div> : null}
        </div>
        </div>
        <aside className="overflow-y-auto bg-[var(--surface-subtle)] p-4">{selected ? <><p className="font-heading text-lg uppercase">Impact ledger</p><dl className="mt-3 space-y-3 border-y py-3 text-xs"><Impact label="Daily hours" value={`${selected.impact.projectedDailyHours}h`} /><Impact label="Weekly hours" value={`${selected.impact.projectedWeeklyHours}h`} /><Impact label="Consecutive days" value={String(selected.impact.projectedConsecutiveDays)} /><Impact label="Overtime" value={selected.impact.overtime ? "Projected" : "No"} /></dl><div className="mt-4 space-y-2">{[...selected.blockers, ...selected.warnings, ...serverBlockers].map((violation, index) => <div key={`${violation.code}-${index}`} className={violation.severity === "BLOCK" ? "border-l-2 border-[var(--danger-border)] bg-[var(--danger-bg)] p-2" : "border-l-2 border-[var(--warning-border)] bg-[var(--warning-bg)] p-2"}><p className="font-mono text-[9px] font-medium">{violation.code}</p><p className="mt-1 text-xs leading-4">{violation.message}</p><ViolationDetails details={violation.details} /></div>)}{!selected.blockers.length && !selected.warnings.length && !serverBlockers.length ? <p className="flex gap-2 text-xs leading-5 text-[var(--success-fg)]"><UserRoundCheck className="mt-0.5 size-4 shrink-0" />No scheduling conflicts found.</p> : null}</div></> : null}</aside>
      </div>
      <SheetFooter className="border-t bg-white px-5 py-4 sm:px-6"><Button onClick={assign} disabled={!selected || Boolean(selected.blockers.length) || pending}>{pending ? "Rechecking schedule…" : selected ? `Assign ${selected.name}` : "Select staff"}</Button><Button variant="outline" onClick={() => router.replace(returnHref)} disabled={pending}>Cancel</Button></SheetFooter>
    </SheetContent>
  </Sheet>;
}

function Impact({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono font-medium tabular-nums">{value}</dd></div>;
}

function ViolationDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).slice(0, 4);
  if (!entries.length) return null;
  return <dl className="mt-2 space-y-1 border-t border-current/15 pt-2">{entries.map(([key, value]) => <div key={key} className="flex justify-between gap-2 text-[10px]"><dt className="break-all text-current/70">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd className="break-all text-right font-mono">{String(value)}</dd></div>)}</dl>;
}
