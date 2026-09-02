"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { changeSchedulePublicationAction } from "@/app/(dashboard)/schedule/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Blocker = { code: string; message: string };

export function SchedulePublicationControl({ weekId, status, version }: {
  weekId: string;
  status: "draft" | "published";
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [pending, startTransition] = useTransition();
  const publishing = status === "draft";

  function changeStatus() {
    setBlockers([]);
    startTransition(async () => {
      const result = await changeSchedulePublicationAction({ weekId, target: publishing ? "published" : "draft" });
      if (!result.success) {
        setBlockers(result.blockers);
        return;
      }
      toast.success(publishing ? "Schedule published" : "Schedule unpublished", {
        description: publishing ? "Staff can now see this week’s assigned shifts." : "This week is private while edits continue.",
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
      <div className="flex h-9 items-stretch border border-[var(--border-strong)] bg-white">
        <span className={`inline-flex items-center gap-1.5 border-r px-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${publishing ? "bg-[var(--surface-subtle)] text-muted-foreground" : "border-r-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"}`}>
          {publishing ? <CircleDashed className="size-3" /> : <CheckCircle2 className="size-3" />}
          {status}
        </span>
        <span className="inline-flex items-center px-3 font-mono text-[10px] text-muted-foreground">v{version}</span>
      </div>
      <Button size="sm" variant={publishing ? "default" : "outline"} onClick={() => { setBlockers([]); setOpen(true); }}>
        {publishing ? "Publish schedule" : "Unpublish"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Week status</p>
            <DialogTitle>{publishing ? "Publish this schedule?" : "Return this week to draft?"}</DialogTitle>
            <DialogDescription>
              {publishing
                ? "Assigned shifts become visible to staff immediately. Future changes remain subject to the location cutoff."
                : "Staff visibility is removed for this week. A shift already inside the edit cutoff will prevent this action."}
            </DialogDescription>
          </DialogHeader>
          {blockers.length ? (
            <div className="border-l-2 border-[var(--danger-border)] bg-[var(--danger-bg)] p-3" role="alert">
              <p className="flex items-center gap-2 text-xs font-semibold text-[var(--danger-fg)]"><TriangleAlert className="size-4" />Status unchanged</p>
              {blockers.map((item) => <p key={item.code} className="mt-1 text-xs leading-5">{item.message}</p>)}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Keep {status}</Button>
            <Button onClick={changeStatus} disabled={pending}>{pending ? "Checking cutoff…" : publishing ? "Publish schedule" : "Unpublish schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
