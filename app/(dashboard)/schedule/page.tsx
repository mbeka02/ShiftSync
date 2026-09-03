import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock3, MapPin } from "lucide-react";
import { getAuthenticatedUser } from "@/server/auth/session";
import { getAccessibleLocations, getMySchedule, getScheduleForLocation } from "@/server/scheduling/queries";
import { getLocalSnapshot } from "@/server/scheduling/time";
import { ShiftAssignmentCard } from "@/components/shift-sync/shift-assignment-card";
import { SchedulePublicationControl } from "@/components/shift-sync/schedule-publication-control";
import { CoverageQueue, StaffShiftCoverageActions } from "@/components/shift-sync/coverage-workflows";
import { OnDutyDashboard, StaffOnDutyControl } from "@/components/shift-sync/on-duty-dashboard";
import { getManagerCoverageQueue, getStaffCoverageQueue, getSwapTargetsForShifts } from "@/server/coverage/queries";
import { getOnDutyStaff, getOpenTimeEntryForStaff } from "@/server/onduty/queries";
import { loadAssignmentCandidatesAction } from "./actions";
import { db } from "@/server/db";
import { skills } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { CreateShiftModal, EditShiftModal } from "@/components/shift-sync/shift-management";
import { WeekNavigator } from "@/components/shift-sync/week-navigator";

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
    const [coverageQueue, swapTargets, openTimeEntry] = await Promise.all([
      getStaffCoverageQueue(actor),
      getSwapTargetsForShifts(schedule.shifts.map((shift) => shift.shiftId), actor),
      getOpenTimeEntryForStaff(actor),
    ]);
    return <section id="schedule-content" className="scroll-mt-6 px-4 py-6 sm:px-6 lg:px-8"><ScheduleHeading weekStart={weekStart} eyebrow="My shifts" title="Published schedule" />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"><div className="space-y-3">
        {schedule.shifts.length ? schedule.shifts.map((shift) => <article id={`shift-${shift.shiftId}`} key={shift.shiftId} className={`scroll-mt-6 grid gap-3 border bg-white p-4 transition-shadow sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[8rem_minmax(0,1fr)_auto_auto] ${params.shift === shift.shiftId ? "border-primary shadow-[0_0_0_2px_var(--focus-ring)]" : ""}`}><div><p className="font-mono text-xs uppercase text-muted-foreground">{new Date(`${shift.localStartDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</p><p className="mt-1 font-heading text-2xl uppercase">{displayTime(shift.localStartTime)}</p></div><div><p className="font-semibold">{shift.skillName}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-3.5" />{shift.locationName}</p>{shift.riskFlags.some((flag) => flag === "AT_RISK_AVAILABILITY" || flag === "AT_RISK_CERTIFICATION") ? <p className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--warning-fg)]"><AlertTriangle className="size-3" />At risk · manager review needed</p> : null}</div><div className="text-left sm:text-right"><p className="font-mono text-xs">{displayTime(shift.localStartTime)}–{displayTime(shift.localEndTime)}</p><p className="mt-1 text-xs text-muted-foreground">{shift.locationTimezone}</p></div><div className="flex flex-col items-start gap-2 lg:items-end"><StaffOnDutyControl assignmentId={shift.assignmentId} canClockIn={shift.canClockIn} openEntry={openTimeEntry ? { ...openTimeEntry, clockInAt: openTimeEntry.clockInAt.toISOString() } : null} /><StaffShiftCoverageActions shiftId={shift.shiftId} canRequestSwap={shift.canRequestSwap} canRequestDrop={shift.canRequestDrop} targets={swapTargets[shift.shiftId] ?? []} activeRequest={coverageQueue.find((request) => request.shiftId === shift.shiftId && request.isRequester)} /></div></article>) : <EmptySchedule message="No published shifts are assigned to you this week." />}
      </div><ServiceRail count={schedule.shifts.length} staff /></div><CoverageQueue requests={coverageQueue} role="staff" /></section>;
  }

  const accessible = await getAccessibleLocations(actor);
  const selected = accessible.find((location) => location.id === params.location) ?? accessible[0];
  const [result, coverageQueue, onDutyStaff, skillOptions] = selected ? await Promise.all([
    getScheduleForLocation(selected.id, weekStart, actor),
    getManagerCoverageQueue(selected.id, actor),
    getOnDutyStaff(selected.id, actor),
    db.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.active, true)).orderBy(skills.name),
  ]) : [null, [], [], []];
  const shifts = result?.success ? result.data.shifts : [];
  const days = weekDays(weekStart);
  return <section id="schedule-content" className="scroll-mt-6 px-4 py-6 sm:px-6 lg:px-8"><ScheduleHeading weekStart={weekStart} eyebrow="Manager board" title={selected?.name ?? "Schedule workspace"} action={selected ? <><CreateShiftModal locationId={selected.id} weekStartDate={weekStart} timezone={selected.timezone} skills={skillOptions} />{result?.success && result.data.week ? <SchedulePublicationControl weekId={result.data.week.id} status={result.data.week.status} version={result.data.week.version} /> : null}</> : null} />
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"><div className="overflow-x-auto border bg-white"><div className="grid min-w-[760px] grid-cols-7">
      {days.map((day) => <div key={day.iso} className="min-h-[28rem] border-r last:border-r-0"><div className="border-b bg-[var(--surface-subtle)] px-3 py-3"><p className="text-xs font-semibold uppercase tracking-[0.08em]">{day.day}</p><p className="font-mono text-[10px] text-muted-foreground">{day.date}</p></div><div className="space-y-2 p-2">{shifts.filter((shift) => selected && getLocalSnapshot(shift.startsAt, selected.timezone).date === day.iso).map((shift) => selected ? <ShiftAssignmentCard key={shift.shiftId} shift={{ ...shift, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() }} timezone={selected.timezone} loadCandidates={loadAssignmentCandidatesAction} editControl={<EditShiftModal shift={shift} timezone={selected.timezone} skills={skillOptions} />} /> : null)}</div></div>)}
    </div></div><ServiceRail count={shifts.length} /></div>
    {selected ? <OnDutyDashboard key={selected.id} locationId={selected.id} timezone={selected.timezone} staff={onDutyStaff.map((person) => ({ ...person, shiftStartsAt: person.shiftStartsAt.toISOString(), shiftEndsAt: person.shiftEndsAt.toISOString(), clockInAt: person.clockInAt.toISOString() }))} /> : null}
    {selected ? <CoverageQueue requests={coverageQueue} role="manager" /> : <div className="mt-6"><EmptySchedule message="No active locations are assigned to this account yet." /></div>}
  </section>;
}

function ScheduleHeading({ weekStart, eyebrow, title, action }: { weekStart: string; eyebrow: string; title: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{eyebrow}</p><h1 className="mt-1 font-heading text-4xl uppercase leading-none">{title}</h1></div><div className="flex flex-wrap items-center gap-3 lg:pb-0.5"><WeekNavigator weekStart={weekStart} />{action}</div></header>;
}

function ServiceRail({ count, staff = false }: { count: number; staff?: boolean }) {
  return <aside aria-label="Service summary" className="h-fit border bg-white"><div className="border-b bg-[var(--color-deep-water)] px-4 py-3 text-white"><p className="font-heading text-lg uppercase tracking-wide">Service rail</p></div><div className="space-y-4 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-4 text-[var(--success-fg)]" /><div><p className="text-sm font-semibold">Published view</p><p className="text-xs leading-5 text-muted-foreground">{staff ? "Draft planning stays private until managers publish." : "The board reflects the selected schedule week."}</p></div></div><div className="flex items-center justify-between border-t pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-4" />Visible shifts</span><strong className="font-mono text-xl">{count}</strong></div></div></aside>;
}

function EmptySchedule({ message }: { message: string }) {
  return <div className="border border-dashed bg-white px-6 py-14 text-center"><CalendarCheck2 className="mx-auto size-8 text-primary" /><h2 className="mt-4 font-heading text-2xl uppercase">Clear water ahead</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p></div>;
}
