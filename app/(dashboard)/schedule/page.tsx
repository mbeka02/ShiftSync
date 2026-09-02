import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, CheckCircle2, Clock3, MapPin } from "lucide-react";
import { getAuthenticatedUser } from "@/server/auth/session";
import { getAccessibleLocations, getMySchedule, getScheduleForLocation } from "@/server/scheduling/queries";
import { getAssignmentCandidates } from "@/server/scheduling/candidates";
import { getLocalSnapshot } from "@/server/scheduling/time";
import { CandidateDrawer } from "@/components/shift-sync/candidate-drawer";

function mondayToday() {
  const date = new Date();
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return { iso: date.toISOString().slice(0, 10), day: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
  });
}

const displayTime = (value: string) => new Date(`2000-01-01T${value}Z`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; location?: string; shift?: string }> }) {
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) redirect("/login");
  const params = await searchParams;
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") ? params.week! : mondayToday();
  const staff = actor.roles.some((role) => role.code === "staff") && !actor.roles.some((role) => role.code === "admin" || role.code === "manager");

  if (staff) {
    const schedule = await getMySchedule(weekStart, actor);
    return <section className="px-4 py-6 sm:px-6 lg:px-8"><ScheduleHeading weekStart={weekStart} eyebrow="My shifts" title="Published schedule" />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"><div className="space-y-3">
        {schedule.shifts.length ? schedule.shifts.map((shift) => <article key={shift.shiftId} className="grid gap-3 border bg-white p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-center"><div><p className="font-mono text-xs uppercase text-muted-foreground">{new Date(`${shift.localStartDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</p><p className="mt-1 font-heading text-2xl uppercase">{displayTime(shift.localStartTime)}</p></div><div><p className="font-semibold">{shift.skillName}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-3.5" />{shift.locationName}</p></div><div className="text-left sm:text-right"><p className="font-mono text-xs">{displayTime(shift.localStartTime)}–{displayTime(shift.localEndTime)}</p><p className="mt-1 text-xs text-muted-foreground">{shift.locationTimezone}</p></div></article>) : <EmptySchedule message="No published shifts are assigned to you this week." />}
      </div><ServiceRail count={schedule.shifts.length} staff /></div></section>;
  }

  const accessible = await getAccessibleLocations(actor);
  const selected = accessible.find((location) => location.id === params.location) ?? accessible[0];
  const result = selected ? await getScheduleForLocation(selected.id, weekStart, actor) : null;
  const shifts = result?.success ? result.data.shifts : [];
  const days = weekDays(weekStart);
  const selectedShift = shifts.find((shift) => shift.shiftId === params.shift);
  const candidateData = selectedShift ? await getAssignmentCandidates(selectedShift.shiftId, actor) : null;
  const returnHref = selected ? `/schedule?week=${weekStart}&location=${selected.id}` : `/schedule?week=${weekStart}`;
  return <section className="px-4 py-6 sm:px-6 lg:px-8"><ScheduleHeading weekStart={weekStart} eyebrow="Manager board" title={selected?.name ?? "Schedule workspace"} />
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"><div className="overflow-x-auto border bg-white"><div className="grid min-w-[760px] grid-cols-7">
      {days.map((day) => <div key={day.iso} className="min-h-[28rem] border-r last:border-r-0"><div className="border-b bg-[var(--surface-subtle)] px-3 py-3"><p className="text-xs font-semibold uppercase tracking-[0.08em]">{day.day}</p><p className="font-mono text-[10px] text-muted-foreground">{day.date}</p></div><div className="space-y-2 p-2">{shifts.filter((shift) => selected && getLocalSnapshot(shift.startsAt, selected.timezone).date === day.iso).map((shift) => <Link key={shift.shiftId} href={`${returnHref}&shift=${shift.shiftId}`} aria-label={`Assign staff to ${shift.skillName} shift`} className={`block border-l-2 bg-[var(--surface-subtle)] p-2.5 transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${shift.openHeadcount > 0 ? "border-[var(--color-signal-coral)]" : "border-primary"}`}><p className="text-xs font-semibold">{shift.skillName}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{shift.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: selected?.timezone })} · {shift.openHeadcount > 0 ? `${shift.openHeadcount} open` : "Covered"}</p><p className="mt-1 truncate text-[11px]">{shift.assignees.length ? shift.assignees.map((person) => `${person.firstName} ${person.lastName}`).join(", ") : "Select staff"}</p></Link>)}</div></div>)}
    </div></div><ServiceRail count={shifts.length} /></div>
    {!selected ? <div className="mt-6"><EmptySchedule message="No active locations are assigned to this account yet." /></div> : null}
    {candidateData ? <CandidateDrawer shift={candidateData.shift} candidates={candidateData.candidates} returnHref={returnHref} /> : null}
  </section>;
}

function ScheduleHeading({ weekStart, eyebrow, title }: { weekStart: string; eyebrow: string; title: string }) {
  return <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{eyebrow}</p><h1 className="mt-1 font-heading text-4xl uppercase leading-none">{title}</h1></div><div className="border-l-2 border-primary pl-3"><p className="text-xs text-muted-foreground">Week of</p><p className="font-mono text-sm font-medium">{weekStart}</p></div></header>;
}

function ServiceRail({ count, staff = false }: { count: number; staff?: boolean }) {
  return <aside aria-label="Service summary" className="h-fit border bg-white"><div className="border-b bg-[var(--color-deep-water)] px-4 py-3 text-white"><p className="font-heading text-lg uppercase tracking-wide">Service rail</p></div><div className="space-y-4 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-4 text-[var(--success-fg)]" /><div><p className="text-sm font-semibold">Published view</p><p className="text-xs leading-5 text-muted-foreground">{staff ? "Draft planning stays private until managers publish." : "The board reflects the selected schedule week."}</p></div></div><div className="flex items-center justify-between border-t pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-4" />Visible shifts</span><strong className="font-mono text-xl">{count}</strong></div></div></aside>;
}

function EmptySchedule({ message }: { message: string }) {
  return <div className="border border-dashed bg-white px-6 py-14 text-center"><CalendarCheck2 className="mx-auto size-8 text-primary" /><h2 className="mt-4 font-heading text-2xl uppercase">Clear water ahead</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p></div>;
}
