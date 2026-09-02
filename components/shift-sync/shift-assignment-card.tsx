"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { getAssignmentCandidates } from "@/server/scheduling/candidates";
import { CandidateDrawer } from "@/components/shift-sync/candidate-drawer";

type CandidateData = NonNullable<Awaited<ReturnType<typeof getAssignmentCandidates>>>;
type CandidateLoadResult = { success: true; data: CandidateData } | { success: false; error: string };

type ShiftCardData = {
  shiftId: string;
  skillName: string;
  startsAt: string;
  endsAt: string;
  openHeadcount: number;
  riskFlags: string[];
  assignees: Array<{ firstName: string; lastName: string; riskFlags: string[] }>;
};

export function ShiftAssignmentCard({ shift, timezone, loadCandidates }: {
  shift: ShiftCardData;
  timezone: string;
  loadCandidates: (shiftId: string) => Promise<CandidateLoadResult>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = useRef(0);
  const openedFromCard = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CandidateData | null>(null);
  const open = searchParams.get("shift") === shift.shiftId;

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setData(null);
    setLoading(true);
    setError(null);
    try {
      const result = await loadCandidates(shift.shiftId);
      if (currentRequest !== requestId.current) return;
      if (result.success) setData(result.data);
      else setError(result.error);
    } catch {
      if (currentRequest === requestId.current) {
        setError("The schedule service did not respond. Try again in a moment.");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [loadCandidates, shift.shiftId]);

  useEffect(() => {
    if (!open || data || loading || error) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [data, error, load, loading, open]);

  function updateUrl(nextOpen: boolean) {
    const url = new URL(window.location.href);
    if (nextOpen) url.searchParams.set("shift", shift.shiftId);
    else url.searchParams.delete("shift");
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (nextOpen) window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }

  function openDrawer() {
    openedFromCard.current = true;
    updateUrl(true);
    if (!loading) void load();
  }

  function closeDrawer() {
    if (openedFromCard.current) {
      openedFromCard.current = false;
      window.history.back();
    } else {
      updateUrl(false);
    }
  }

  const displayedStart = new Date(shift.startsAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  return (
    <>
      <button
        id={`shift-${shift.shiftId}`}
        type="button"
        onClick={openDrawer}
        aria-label={`Assign staff to ${shift.skillName} shift`}
        className={`block w-full scroll-mt-6 border-l-2 bg-[var(--surface-subtle)] p-2.5 text-left transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${shift.openHeadcount > 0 ? "border-[var(--color-signal-coral)]" : "border-primary"}`}
      >
        <span className="block text-xs font-semibold">{shift.skillName}</span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
          {displayedStart} · {shift.openHeadcount > 0 ? `${shift.openHeadcount} open` : "Covered"}
        </span>
        <span className="mt-1 block truncate text-[11px]">
          {shift.assignees.length ? shift.assignees.map((person) => `${person.firstName} ${person.lastName}`).join(", ") : "Select staff"}
        </span>
        {shift.riskFlags.some((flag) => flag === "AT_RISK_AVAILABILITY" || flag === "AT_RISK_CERTIFICATION") ? (
          <span className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--warning-fg)]">
            <AlertTriangle className="size-3" /> At risk
          </span>
        ) : null}
      </button>

      {open ? (
        <CandidateDrawer
          open={open}
          shift={data?.shift ?? {
            id: shift.shiftId,
            skillName: shift.skillName,
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            timezone,
            emergencyCoverageRequired: false,
          }}
          candidates={data?.candidates ?? []}
          loading={loading || (!data && !error)}
          error={error}
          onRetry={load}
          onOpenChange={(nextOpen) => { if (!nextOpen) closeDrawer(); }}
          onAssigned={() => {
            closeDrawer();
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
