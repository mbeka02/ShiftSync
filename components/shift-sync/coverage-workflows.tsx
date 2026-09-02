"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Check, Clock3, HandHelping, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createDropRequestAction,
  createSwapRequestAction,
  transitionCoverageRequestAction,
} from "@/app/(dashboard)/schedule/coverage-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Blocker = { code: string; message: string };

export type CoverageRequestView = {
  id: string;
  shiftId: string;
  requesterStaffId: string;
  targetStaffId: string | null;
  claimantStaffId: string | null;
  type: "swap" | "drop";
  status: "open" | "pending_target" | "accepted_by_target" | "claimed" | "approved" | "cancelled" | "rejected" | "expired";
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationName: string;
  skillName: string;
  requesterName: string;
  targetName: string | null;
  claimantName: string | null;
  isRequester: boolean;
  isTarget: boolean;
  isClaimant: boolean;
};

const statusCopy: Record<CoverageRequestView["status"], string> = {
  open: "Open for a coworker",
  pending_target: "Waiting for coworker",
  accepted_by_target: "Waiting for manager",
  claimed: "Waiting for manager",
  approved: "Approved",
  cancelled: "Cancelled",
  rejected: "Rejected",
  expired: "Expired",
};

function blockerPanel(blockers: Blocker[]) {
  return blockers.length ? (
    <div className="border-l-2 border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs leading-5 text-[var(--danger-fg)]" role="alert">
      {blockers.map((item) => <p key={item.code}>{item.message}</p>)}
    </div>
  ) : null;
}

export function StaffShiftCoverageActions({
  shiftId,
  canRequestSwap,
  canRequestDrop,
  targets,
  activeRequest,
}: {
  shiftId: string;
  canRequestSwap: boolean;
  canRequestDrop: boolean;
  targets: Array<{ staffId: string; name: string }>;
  activeRequest?: CoverageRequestView;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"swap" | "drop" | null>(null);
  const [targetStaffId, setTargetStaffId] = useState(targets[0]?.staffId ?? "");
  const [reason, setReason] = useState("");
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!mode) return;
    setBlockers([]);
    startTransition(async () => {
      const result = mode === "swap"
        ? await createSwapRequestAction({ shiftId, targetStaffId, reason })
        : await createDropRequestAction({ shiftId, reason });
      if (!result.success) {
        setBlockers(result.blockers);
        return;
      }
      toast.success(mode === "swap" ? "Swap requested" : "Shift offered for coverage", {
        description: "You remain assigned until a manager approves the change.",
      });
      setMode(null);
      setReason("");
      router.refresh();
    });
  }

  function cancel() {
    if (!activeRequest) return;
    startTransition(async () => {
      const result = await transitionCoverageRequestAction({ requestId: activeRequest.id, action: "cancel" });
      if (!result.success) {
        toast.error("Request not cancelled", { description: result.blockers[0]?.message });
        return;
      }
      toast.success("Coverage request cancelled", { description: "You remain assigned to this shift." });
      setCancelOpen(false);
      router.refresh();
    });
  }

  if (activeRequest) {
    return (
      <>
        <div className="min-w-[10rem] border-l border-[var(--border-strong)] pl-3 sm:text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary">{statusCopy[activeRequest.status]}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">You remain assigned.</p>
          <Button size="xs" variant="ghost" className="mt-1 px-0 text-muted-foreground hover:bg-transparent" onClick={() => setCancelOpen(true)} disabled={pending}>
            <X className="size-3" /> Cancel request
          </Button>
        </div>
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent>
            <DialogHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Coverage request</p>
              <DialogTitle>Cancel this request?</DialogTitle>
              <DialogDescription>The request will close and any coworker who accepted or claimed it will be notified.</DialogDescription>
            </DialogHeader>
            <div className="border-l-2 border-primary bg-[var(--surface-subtle)] px-3 py-2 text-xs leading-5">Cancel request; you keep the shift.</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={pending}>Keep request</Button>
              <Button onClick={cancel} disabled={pending}>{pending ? "Cancelling…" : "Cancel request"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button size="xs" variant="outline" onClick={() => { setBlockers([]); setMode("swap"); }} disabled={!targets.length || !canRequestSwap} title={!canRequestSwap ? "This shift has already started." : !targets.length ? "No qualified coworkers are currently available for a direct swap." : undefined}>
          <ArrowRightLeft className="size-3" /> Request swap
        </Button>
        <Button size="xs" variant="ghost" onClick={() => { setBlockers([]); setMode("drop"); }} disabled={!canRequestDrop} title={!canRequestDrop ? "Drop requests close 24 hours before the shift starts." : undefined}>
          <HandHelping className="size-3" /> Drop shift
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) setMode(null); }}>
        <DialogContent>
          <DialogHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Coverage request</p>
            <DialogTitle>{mode === "swap" ? "Request a shift swap" : "Offer this shift for coverage"}</DialogTitle>
            <DialogDescription>
              {mode === "swap"
                ? "Your coworker must accept before a manager can approve the transfer."
                : "A qualified coworker can claim the shift until 24 hours before it starts."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {mode === "swap" ? (
              <label className="block">
                <span className="text-xs font-semibold">Qualified coworker</span>
                <NativeSelect className="mt-1 w-full" value={targetStaffId} onChange={(event) => setTargetStaffId(event.target.value)}>
                  {targets.map((target) => <NativeSelectOption key={target.staffId} value={target.staffId}>{target.name}</NativeSelectOption>)}
                </NativeSelect>
              </label>
            ) : null}
            <label className="block">
              <span className="text-xs font-semibold">Reason <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Add context for your coworker and manager" />
            </label>
            <div className="border-l-2 border-primary bg-[var(--surface-subtle)] px-3 py-2 text-xs leading-5">
              Your current assignment stays active until manager approval.
            </div>
            {blockerPanel(blockers)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>Keep my shift</Button>
            <Button onClick={submit} disabled={pending || (mode === "swap" && !targetStaffId)}>
              {pending ? "Sending…" : mode === "swap" ? "Request swap" : "Offer shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CoverageQueue({ requests, role }: { requests: CoverageRequestView[]; role: "staff" | "manager" }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CoverageRequestView | null>(null);
  const [blockers, setBlockers] = useState<Record<string, Blocker[]>>({});
  const [, startTransition] = useTransition();
  const visible = role === "manager"
    ? requests
    : requests.filter((request) =>
      (request.type === "swap" && request.status === "pending_target" && request.isTarget)
      || (request.type === "drop" && request.status === "open" && !request.isRequester)
      || request.isClaimant);

  function act(request: CoverageRequestView) {
    const action = role === "manager"
      ? request.type === "swap" ? "approve-swap" as const : "approve-drop" as const
      : request.type === "swap" ? "accept-swap" as const : "claim-drop" as const;
    setPendingId(request.id);
    setBlockers((current) => ({ ...current, [request.id]: [] }));
    startTransition(async () => {
      const result = await transitionCoverageRequestAction({ requestId: request.id, action });
      setPendingId(null);
      if (!result.success) {
        setBlockers((current) => ({ ...current, [request.id]: result.blockers }));
        return;
      }
      toast.success(role === "manager" ? "Coverage approved" : request.type === "swap" ? "Swap accepted" : "Shift claimed", {
        description: role === "manager" ? "The assignment transfer is now complete." : "The original assignment remains active until manager approval.",
      });
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <>
    <section className="mt-8 border bg-white" aria-labelledby={`${role}-coverage-title`}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Coverage desk</p>
          <h2 id={`${role}-coverage-title`} className="font-heading text-xl uppercase tracking-wide">{role === "manager" ? "Requests awaiting action" : "Coverage opportunities"}</h2>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{visible.length}</span>
      </div>
      {visible.length ? (
        <div className="divide-y">
          {visible.map((request) => {
            const ready = role === "manager"
              ? ["accepted_by_target", "claimed"].includes(request.status)
              : (request.status === "pending_target" && request.isTarget) || (request.status === "open" && !request.isRequester);
            const replacement = request.type === "swap" ? request.targetName : request.claimantName;
            const when = new Date(request.startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: request.timezone });
            return (
              <article id={`coverage-request-${request.id}`} key={request.id} className="scroll-mt-6 grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary">{request.type}</span>
                    <span className="text-[11px] text-muted-foreground">{statusCopy[request.status]}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold">{request.skillName} · {request.locationName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3" />{when}</p>
                  <p className="mt-2 text-xs leading-5">{request.requesterName}{replacement ? ` → ${replacement}` : " is looking for coverage"}</p>
                  {request.reason ? <p className="mt-1 text-xs italic text-muted-foreground">“{request.reason}”</p> : null}
                  {blockerPanel(blockers[request.id] ?? [])}
                </div>
                <div className="md:text-right">
                  {ready ? (
                    <Button size="sm" onClick={() => role === "manager" ? setConfirming(request) : act(request)} disabled={pendingId === request.id}>
                      {role === "manager" ? <ShieldCheck className="size-4" /> : <Check className="size-4" />}
                      {pendingId === request.id ? "Checking…" : role === "manager" ? "Approve transfer" : request.type === "swap" ? "Accept swap" : "Claim shift"}
                    </Button>
                  ) : <span className="text-xs text-muted-foreground">No manager action yet</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="px-6 py-10 text-center">
          <HandHelping className="mx-auto size-6 text-primary" />
          <p className="mt-3 text-sm font-semibold">Nothing needs attention</p>
          <p className="mt-1 text-xs text-muted-foreground">New swap and drop requests will appear here.</p>
        </div>
      )}
    </section>
    <Dialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
      <DialogContent>
        <DialogHeader>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Manager approval</p>
          <DialogTitle>Approve assignment transfer?</DialogTitle>
          <DialogDescription>Eligibility and schedule constraints will be checked again inside the approval transaction.</DialogDescription>
        </DialogHeader>
        {confirming ? (
          <div className="border-l-2 border-primary bg-[var(--surface-subtle)] px-3 py-3 text-xs leading-5">
            <strong>{confirming.requesterName}</strong> will be removed from the shift. <strong>{confirming.type === "swap" ? confirming.targetName : confirming.claimantName}</strong> will become the assigned staff member only if every constraint still passes.
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(null)} disabled={Boolean(pendingId)}>Keep pending</Button>
          <Button onClick={() => { if (confirming) act(confirming); }} disabled={Boolean(pendingId)}><ShieldCheck className="size-4" />{pendingId ? "Checking…" : "Approve transfer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
