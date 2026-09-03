"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Clock3, LoaderCircle, RefreshCw, ShieldX, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { assignEmergencyCoverageAction, assignStaffAction } from "@/app/(dashboard)/schedule/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Violation = { code: string; severity: "BLOCK" | "WARNING"; message: string; details: Record<string, unknown> };
type Candidate = {
  staffId: string;
  name: string;
  blockers: Violation[];
  warnings: Violation[];
  impact: { projectedDailyHours: number; projectedWeeklyHours: number; projectedConsecutiveDays: number; overtime: boolean };
};

type DrawerShift = {
  id: string;
  skillName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  emergencyCoverageRequired: boolean;
};

const hiddenTechnicalDetails = new Set([
  "adjacentShiftId",
  "conflictingShiftId",
  "locationId",
  "requiredSkillId",
  "shiftId",
]);

const detailLabels: Record<string, string> = {
  activeAssignmentCount: "Assigned",
  actualRestHours: "Rest available",
  hardLimitHours: "Daily limit",
  headcount: "Positions",
  overtimeThresholdHours: "Overtime begins",
  projectedConsecutiveDays: "Projected streak",
  projectedDailyHours: "Projected day",
  projectedWeeklyHours: "Projected week",
  requiredRestHours: "Rest required",
  warningThresholdHours: "Warning begins",
};

export function CandidateDrawer({ open, shift, candidates, loading, error, onRetry, onOpenChange, onAssigned }: {
  open: boolean;
  shift: DrawerShift;
  candidates: Candidate[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.staffId ?? null);
  const [serverBlockers, setServerBlockers] = useState<Violation[]>([]);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, startTransition] = useTransition();
  const effectiveSelectedId = candidates.some((candidate) => candidate.staffId === selectedId)
    ? selectedId
    : candidates[0]?.staffId ?? null;
  const selected = useMemo(() => candidates.find((candidate) => candidate.staffId === effectiveSelectedId), [candidates, effectiveSelectedId]);
  const seventhDayOverride = Boolean(
    selected?.blockers.length === 1
    && selected.blockers[0]?.code === "SEVENTH_DAY_OVERRIDE_REQUIRED",
  );

  const time = new Date(shift.startsAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: shift.timezone,
  });

  function assign() {
    if (!selected) return;
    setServerBlockers([]);
    startTransition(async () => {
      const result = shift.emergencyCoverageRequired
        ? await assignEmergencyCoverageAction({ shiftId: shift.id, staffId: selected.staffId, reason: emergencyReason })
        : await assignStaffAction({
          shiftId: shift.id,
          staffId: selected.staffId,
          managerOverride: seventhDayOverride,
          overrideReason: seventhDayOverride ? overrideReason : undefined,
        });
      if (!result.success) {
        setServerBlockers(result.blockers);
        toast.error("Assignment not saved", {
          description: result.blockers[0]?.message ?? "The schedule changed before this assignment could be saved.",
        });
        return;
      }
      toast.success(shift.emergencyCoverageRequired ? "Emergency coverage assigned" : "Staff assigned", {
        description: shift.emergencyCoverageRequired
          ? `${selected.name} was assigned to the ${shift.skillName} shift and notified.`
          : `${selected.name} was added to the ${shift.skillName} shift.`,
      });
      onAssigned();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-full sm:!max-w-2xl lg:!max-w-3xl" side="right" aria-busy={loading}>
        <SheetHeader className="border-b px-5 py-5 pr-14 sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{shift.emergencyCoverageRequired ? "Audited emergency coverage" : "Assignment preview"}</p>
          <SheetTitle className="text-2xl">Choose staff</SheetTitle>
          <SheetDescription>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Clock3 className="size-3.5 shrink-0" />
              <span>{shift.skillName}</span>
              <span aria-hidden>·</span>
              <span>{time}</span>
              <span aria-hidden>·</span>
              <span>{shift.timezone}</span>
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 overflow-y-auto border-b p-3 sm:p-4 md:border-r md:border-b-0">
            {loading ? <CandidateLoading /> : error ? (
              <div className="border border-[var(--danger-border)] bg-[var(--danger-bg)] p-5" role="alert">
                <p className="font-semibold text-[var(--danger-fg)]">Candidate review unavailable</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-default)]">{error}</p>
                <Button className="mt-4" size="sm" variant="outline" onClick={onRetry}>
                  <RefreshCw className="size-3.5" /> Try again
                </Button>
              </div>
            ) : <>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">
                {candidates.length} staff reviewed against the current schedule
              </p>
              <div className="space-y-2">
              {candidates.map((candidate) => {
                const blocked = candidate.blockers.length > 0;
                const warning = !blocked && candidate.warnings.length > 0;
                const state = blocked ? "Blocked" : warning ? "Review" : "Eligible";
                return (
                  <button
                    key={candidate.staffId}
                    type="button"
                    onClick={() => { setSelectedId(candidate.staffId); setServerBlockers([]); setOverrideReason(""); }}
                    aria-pressed={candidate.staffId === effectiveSelectedId}
                    className="grid min-h-24 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border bg-white p-3 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-[var(--surface-subtle)]"
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-semibold">{candidate.name}</span>
                        <span className={`font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${blocked ? "text-[var(--danger-fg)]" : warning ? "text-[var(--warning-fg)]" : "text-[var(--success-fg)]"}`}>
                          {state}
                        </span>
                      </span>
                      <span className="mt-1 block font-mono text-[10px] leading-4 text-muted-foreground">
                        {candidate.impact.projectedWeeklyHours}h projected · {candidate.impact.projectedConsecutiveDays} day streak
                      </span>
                      <span className="mt-1 block break-words text-xs leading-4 text-muted-foreground">
                        {blocked ? candidate.blockers[0].message : warning ? candidate.warnings[0].message : "Qualified, available, and rested"}
                      </span>
                    </span>
                    <span className={blocked ? "text-[var(--danger-fg)]" : warning ? "text-[var(--warning-fg)]" : "text-[var(--success-fg)]"} aria-hidden>
                      {blocked ? <ShieldX className="size-5" /> : warning ? <AlertTriangle className="size-5" /> : <Check className="size-5" />}
                    </span>
                  </button>
                );
              })}
                {!candidates.length ? (
                  <div className="border border-dashed p-6 text-center">
                    <p className="font-semibold">No staff profiles found</p>
                    <p className="mt-1 text-xs text-muted-foreground">Add staff qualifications before assigning this shift.</p>
                  </div>
                ) : null}
              </div>
            </>}
          </div>

          <aside className="min-w-0 overflow-y-auto bg-[var(--surface-subtle)] p-4 sm:p-5">
            {loading ? (
              <div aria-live="polite">
                <LoaderCircle className="size-5 animate-spin text-primary" />
                <p className="mt-3 font-heading text-lg uppercase">Checking the schedule…</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Qualifications, availability, rest, and projected hours are being evaluated.</p>
              </div>
            ) : selected ? (
              <>
                <p className="font-heading text-lg uppercase">Impact ledger</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{selected.name}</p>
                <dl className="mt-3 space-y-3 border-y py-3 text-xs">
                  <Impact label="Daily hours" value={`${selected.impact.projectedDailyHours}h`} />
                  <Impact label="Weekly hours" value={`${selected.impact.projectedWeeklyHours}h`} />
                  <Impact label="Consecutive days" value={String(selected.impact.projectedConsecutiveDays)} />
                  <Impact label="Overtime" value={selected.impact.overtime ? "Projected" : "No"} />
                </dl>
                <div className="mt-4 space-y-2">
                  {[...selected.blockers, ...selected.warnings, ...serverBlockers].map((violation, index) => (
                    <div key={`${violation.code}-${index}`} className={violation.severity === "BLOCK" ? "border-l-2 border-[var(--danger-border)] bg-[var(--danger-bg)] p-3" : "border-l-2 border-[var(--warning-border)] bg-[var(--warning-bg)] p-3"}>
                      <p className="font-mono text-[9px] font-medium tracking-[0.04em]">{violation.code.replaceAll("_", " ")}</p>
                      <p className="mt-1 break-words text-xs leading-5">{violation.message}</p>
                      <ViolationDetails details={violation.details} />
                    </div>
                  ))}
                  {!selected.blockers.length && !selected.warnings.length && !serverBlockers.length ? (
                    <p className="flex gap-2 text-xs leading-5 text-[var(--success-fg)]">
                      <UserRoundCheck className="mt-0.5 size-4 shrink-0" />
                      No scheduling conflicts found.
                    </p>
                  ) : null}
                </div>
                {shift.emergencyCoverageRequired ? (
                  <div className="mt-5 border-l-2 border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
                    <p className="text-xs font-semibold text-[var(--warning-fg)]">Inside the edit cutoff</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-default)]">Coverage is allowed, but the reason becomes part of the audit history.</p>
                    <Label htmlFor="emergency-reason" className="mt-3 block text-xs">Emergency reason</Label>
                    <Textarea
                      id="emergency-reason"
                      value={emergencyReason}
                      onChange={(event) => setEmergencyReason(event.target.value)}
                      placeholder="Example: last-minute call-out"
                      className="mt-1 min-h-20 bg-white px-2"
                      maxLength={240}
                    />
                    <p className="mt-1 text-right font-mono text-[9px] text-muted-foreground">{emergencyReason.length}/240</p>
                  </div>
                ) : null}
                {!shift.emergencyCoverageRequired && seventhDayOverride ? (
                  <div className="mt-5 border-l-2 border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
                    <p className="text-xs font-semibold text-[var(--warning-fg)]">Seventh consecutive day</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-default)]">This assignment needs a documented manager decision. The reason is stored with the assignment and audit history.</p>
                    <Label htmlFor="seventh-day-override-reason" className="mt-3 block text-xs">Override reason</Label>
                    <Textarea
                      id="seventh-day-override-reason"
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Explain why the seventh-day assignment is necessary"
                      className="mt-1 min-h-20 bg-white px-2"
                      maxLength={500}
                    />
                    <p className="mt-1 text-right font-mono text-[9px] text-muted-foreground">{overrideReason.length}/500</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>

        <SheetFooter className="border-t bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={assign} disabled={loading || Boolean(error) || !selected || (Boolean(selected.blockers.length) && !seventhDayOverride) || pending || (shift.emergencyCoverageRequired && !emergencyReason.trim()) || (seventhDayOverride && !overrideReason.trim())}>
            {loading ? "Reviewing candidates…" : pending ? "Rechecking schedule…" : selected ? shift.emergencyCoverageRequired ? "Assign emergency coverage" : seventhDayOverride ? `Override and assign ${selected.name}` : `Assign ${selected.name}` : "Select staff"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CandidateLoading() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-3 w-48 animate-pulse bg-[var(--surface-inset)]" />
      {[0, 1, 2].map((item) => (
        <div key={item} className="border bg-white p-3">
          <div className="h-3 w-2/5 animate-pulse bg-[var(--surface-inset)]" />
          <div className="mt-3 h-2.5 w-3/4 animate-pulse bg-[var(--surface-inset)]" />
          <div className="mt-2 h-2.5 w-full animate-pulse bg-[var(--surface-inset)]" />
        </div>
      ))}
    </div>
  );
}

function Impact({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono font-medium tabular-nums">{value}</dd></div>;
}

function formatDetail(key: string, value: unknown) {
  if (typeof value === "number" && key.toLowerCase().includes("hours")) return `${Number(value.toFixed(1))}h`;
  if (typeof value === "number" && key === "projectedConsecutiveDays") return `${value} days`;
  return String(value);
}

function ViolationDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([key]) => !hiddenTechnicalDetails.has(key)).slice(0, 4);
  if (!entries.length) return null;
  return (
    <dl className="mt-2 space-y-1.5 border-t border-current/15 pt-2">
      {entries.map(([key, value]) => (
        <div key={key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-[10px] leading-4">
          <dt className="break-words text-current/70">{detailLabels[key] ?? key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
          <dd className="max-w-28 break-words text-right font-mono tabular-nums">{formatDetail(key, value)}</dd>
        </div>
      ))}
    </dl>
  );
}
