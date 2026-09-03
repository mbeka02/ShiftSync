"use client";

import { useState, useTransition } from "react";
import { Clock3, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createShiftAction, updateShiftAction } from "@/app/(dashboard)/schedule/actions";

type SkillOption = { id: string; name: string };
type ActionResult = { success: boolean; blockers?: Array<{ message: string }> };

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function ShiftFields({ timezone, skills, values, onChange }: {
  timezone: string;
  skills: SkillOption[];
  values: { startsLocal: string; endsLocal: string; requiredSkillId: string; headcount: number; premium: boolean };
  onChange: (next: typeof values) => void;
}) {
  return <div className="space-y-5">
    <div className="border-l-2 border-primary bg-[var(--surface-subtle)] px-3 py-2.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-2 font-semibold text-foreground"><Clock3 className="size-3.5 text-primary" />Times use {timezone}</span>
      ShiftSync stores the matching UTC instants and preserves these local wall-clock values for review.
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Starts"><Input required type="datetime-local" value={values.startsLocal} onChange={(event) => onChange({ ...values, startsLocal: event.target.value })} /></FormField>
      <FormField label="Ends"><Input required type="datetime-local" value={values.endsLocal} onChange={(event) => onChange({ ...values, endsLocal: event.target.value })} /></FormField>
    </div>
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
      <FormField label="Required skill">
        <select required value={values.requiredSkillId} onChange={(event) => onChange({ ...values, requiredSkillId: event.target.value })} className="h-10 w-full rounded-[var(--radius-sm)] border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20">
          <option value="" disabled>Select a skill</option>
          {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
        </select>
      </FormField>
      <FormField label="Headcount"><Input required type="number" min={1} max={50} value={values.headcount} onChange={(event) => onChange({ ...values, headcount: Number(event.target.value) })} /></FormField>
    </div>
    <Label className="min-h-11 cursor-pointer border bg-[var(--surface-subtle)] px-3">
      <Checkbox checked={values.premium} onCheckedChange={(checked) => onChange({ ...values, premium: checked === true })} />
      <span><span className="block">Premium opportunity</span><span className="block text-xs font-normal text-muted-foreground">Include this shift in fairness evidence.</span></span>
    </Label>
  </div>;
}

function ResultError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</p> : null;
}

export function CreateShiftModal({ locationId, weekStartDate, timezone, skills }: { locationId: string; weekStartDate: string; timezone: string; skills: SkillOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({ startsLocal: `${weekStartDate}T09:00`, endsLocal: `${weekStartDate}T17:00`, requiredSkillId: skills[0]?.id ?? "", headcount: 1, premium: false });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createShiftAction({ locationId, weekStartDate, ...values }) as ActionResult;
      if (!result.success) return setError(result.blockers?.[0]?.message ?? "The shift could not be created.");
      setOpen(false);
      toast.success("Shift created", { description: "The selected week has been updated." });
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" size="sm" onClick={() => setOpen(true)}><Plus />Create shift</Button>
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={submit} className="space-y-6">
        <DialogHeader><DialogTitle>Create shift</DialogTitle><DialogDescription>Add an operational slot to this location and schedule week.</DialogDescription></DialogHeader>
        <ShiftFields timezone={timezone} skills={skills} values={values} onChange={setValues} />
        <ResultError message={error} />
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending || !values.requiredSkillId}>{pending ? "Creating…" : "Create shift"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function EditShiftModal({ shift, timezone, skills }: {
  shift: { shiftId: string; requiredSkillId: string; localStartDate: string; localStartTime: string; localEndDate: string; localEndTime: string; headcount: number; premium: boolean };
  timezone: string;
  skills: SkillOption[];
}) {
  const initial = { startsLocal: `${shift.localStartDate}T${shift.localStartTime.slice(0, 5)}`, endsLocal: `${shift.localEndDate}T${shift.localEndTime.slice(0, 5)}`, requiredSkillId: shift.requiredSkillId, headcount: shift.headcount, premium: shift.premium };
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState(initial);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateShiftAction({ shiftId: shift.shiftId, ...values }) as ActionResult;
      if (!result.success) return setError(result.blockers?.[0]?.message ?? "The shift could not be updated.");
      setOpen(false);
      toast.success("Shift updated", { description: "Assigned staff were rechecked against scheduling constraints." });
    });
  }

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setValues(initial); setError(null); } }}>
    <Button type="button" size="icon-xs" variant="ghost" aria-label="Edit shift" className="bg-white/85 shadow-sm" onClick={(event) => { event.stopPropagation(); setOpen(true); }}><Pencil /></Button>
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={submit} className="space-y-6">
        <DialogHeader><DialogTitle>Edit shift</DialogTitle><DialogDescription>Material changes recheck every active assignee and cancel pending coverage requests.</DialogDescription></DialogHeader>
        <ShiftFields timezone={timezone} skills={skills} values={values} onChange={setValues} />
        <ResultError message={error} />
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Checking constraints…" : "Save changes"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
