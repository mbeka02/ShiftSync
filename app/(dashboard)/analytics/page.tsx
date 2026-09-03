import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Download,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { getAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { scheduleWeeks } from "@/server/db/schema";
import { getAccessibleLocations } from "@/server/scheduling/queries";
import { getOvertimeReport } from "@/server/reports/overtime";
import { getFairnessReport } from "@/server/reports/fairness";

type Params = { location?: string; week?: string };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  if (!actor) redirect("/login");
  const canView = actor.roles.some(
    (role) => role.code === "manager" || role.code === "admin",
  );
  if (!canView) redirect("/schedule");
  const admin = actor.roles.some((role) => role.code === "admin");
  const params = await searchParams;
  const availableLocations = await getAccessibleLocations(actor);
  const location =
    availableLocations.find((item) => item.id === params.location) ??
    availableLocations[0];
  const weeks = location
    ? await db
      .select()
      .from(scheduleWeeks)
      .where(eq(scheduleWeeks.locationId, location.id))
      .orderBy(desc(scheduleWeeks.weekStartDate))
    : [];
  const week = weeks.find((item) => item.id === params.week) ?? weeks[0];
  const [overtime, fairness] =
    location && week
      ? await Promise.all([
        getOvertimeReport(location.id, week.id, actor),
        getFairnessReport(location.id, week.id, actor),
      ])
      : [null, null];

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-[var(--border-strong)] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            Labor evidence
          </p>
          <h1 className="mt-1 font-heading text-4xl uppercase leading-none">
            Analytics ledger
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Trace overtime thresholds and premium-shift allocation back to the
            assignments that produced them.
          </p>
        </div>
        <form className="grid gap-2 sm:grid-cols-2" aria-label="Report scope">
          <label className="grid gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            Location
            <select
              name="location"
              defaultValue={location?.id}
              className="h-10 min-w-52 border border-[var(--border-strong)] bg-white px-3 font-sans text-sm normal-case tracking-normal text-foreground"
            >
              {availableLocations.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            Schedule week
            <select
              name="week"
              defaultValue={week?.id}
              className="h-10 min-w-48 border border-[var(--border-strong)] bg-white px-3 font-sans text-sm normal-case tracking-normal text-foreground"
            >
              {weeks.map((item) => (
                <option value={item.id} key={item.id}>
                  {formatDate(item.weekStartDate)} · {item.status}
                </option>
              ))}
            </select>
          </label>
          <button className="h-9 border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/85 sm:col-span-2 sm:justify-self-end">
            Apply scope
          </button>
        </form>
      </header>

      {!location || !week || !overtime?.success || !fairness?.success ? (
        <EmptyReports />
      ) : (
        <>
          <div className="grid border-x border-b bg-white md:grid-cols-3">
            <LedgerMetric
              icon={Clock3}
              label="Scheduled hours"
              value={`${overtime.summary.totalScheduledHours}h`}
              detail={`${overtime.staffOvertime.length} staff over 40h`}
            />
            <LedgerMetric
              icon={Scale}
              label="Premium opportunities"
              value={fairness.summary.totalEligibleOpportunities}
              detail={`${fairness.summary.totalFilledPremiumAssignments} filled premium assignments`}
            />
            <LedgerMetric
              icon={BarChart3}
              label="Projected OT premium"
              value={
                overtime.staffHours.some((staff) => staff.hourlyRate !== null)
                  ? formatMoney(overtime.summary.projectedIncrementalPremium)
                  : "—"
              }
              detail={
                overtime.staffHours.some((staff) => staff.hourlyRate !== null)
                  ? "Configured compensation only"
                  : "Compensation not configured"
              }
            />
          </div>

          <section
            className="mt-7 border bg-white"
            aria-labelledby="overtime-heading"
          >
            <ReportHeader
              id="overtime-heading"
              eyebrow="Overtime trap"
              title="Weekly threshold sequence"
              note="35h watch · 40h overtime"
            />
            <div className="divide-y">
              {overtime.staffHours.length ? (
                overtime.staffHours.map((staff) => (
                  <details key={staff.staffId} className="group">
                    <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 hover:bg-[var(--surface-subtle)] sm:grid-cols-[minmax(10rem,1fr)_minmax(16rem,2fr)_8rem] sm:items-center">
                      <div>
                        <p className="font-semibold">{staff.staffName}</p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                          Desired {staff.desiredWeeklyHours}h
                        </p>
                      </div>
                      <HoursBar
                        total={staff.totalHours}
                        overtime={staff.overtimeHours}
                      />
                      <div className="text-left sm:text-right">
                        <p
                          className={`font-mono text-sm font-medium ${staff.overtimeHours > 0 ? "text-[var(--warning-fg)]" : ""}`}
                        >
                          {staff.totalHours}h total
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {staff.overtimeHours}h overtime
                        </p>
                      </div>
                    </summary>
                    <div className="border-t bg-[var(--surface-subtle)] px-4 py-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        Assignment evidence
                      </p>
                      <ol className="mt-3 grid gap-2 lg:grid-cols-2">
                        {staff.assignments.map((assignment) => (
                          <li
                            key={assignment.assignmentId}
                            className={`flex items-center justify-between gap-4 border bg-white px-3 py-2 text-xs ${assignment.assignmentId === staff.thresholdCausingAssignmentId ? "border-[var(--warning-fg)]" : ""}`}
                          >
                            <span>
                              {formatDateTime(assignment.startsAt)} ·{" "}
                              {assignment.hours}h
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {assignment.cumulativeHours}h cumulative
                              {assignment.assignmentId ===
                                staff.thresholdCausingAssignmentId
                                ? " · crossed 40h"
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </details>
                ))
              ) : (
                <ReportEmpty message="No assigned hours exist for this schedule week." />
              )}
            </div>
          </section>

          <section
            className="mt-7 border bg-white"
            aria-labelledby="fairness-heading"
          >
            <ReportHeader
              id="fairness-heading"
              eyebrow="Fairness complaint"
              title="Expected versus actual premium allocation"
              note="Opportunity-normalized evidence"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-[var(--surface-subtle)] font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Staff</th>
                    <th className="px-4 py-3 font-medium">
                      Eligible opportunities
                    </th>
                    <th className="px-4 py-3 font-medium">Expected</th>
                    <th className="px-4 py-3 font-medium">Actual</th>
                    <th className="px-4 py-3 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fairness.staffFairness.map((staff) => (
                    <tr key={staff.staffId} className="align-top">
                      <td className="px-4 py-4 font-semibold">
                        {staff.staffName}
                      </td>
                      <td className="px-4 py-4 font-mono">
                        {staff.eligiblePremiumOpportunities}
                      </td>
                      <td className="px-4 py-4 font-mono">
                        {staff.expectedPremiumShifts}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex min-w-8 justify-center bg-[var(--premium-bg)] px-2 py-1 font-mono text-[var(--premium-fg)]">
                          {staff.actualPremiumShifts}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-primary underline-offset-4 hover:underline">
                            Inspect {staff.evidence.length} premium shifts
                          </summary>
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {staff.evidence.map((shift) => (
                              <li key={String(shift.shiftId)}>
                                {formatDateTime(shift.startsAt as Date)} ·{" "}
                                {shift.eligible ? "eligible" : "not eligible"} ·{" "}
                                {shift.assigned ? "assigned" : "not assigned"}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
            <section
              className="border bg-white"
              aria-labelledby="desired-hours-heading"
            >
              <ReportHeader
                id="desired-hours-heading"
                eyebrow="Desired hours"
                title="Preference versus scheduled"
                note="Preference does not override availability"
              />
              <div className="divide-y">
                {overtime.staffHours.map((staff) => {
                  const delta =
                    Math.round(
                      (staff.totalHours - staff.desiredWeeklyHours) * 100,
                    ) / 100;
                  return (
                    <div
                      key={staff.staffId}
                      className="grid grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-3 px-4 py-3 text-sm"
                    >
                      <span className="font-semibold">{staff.staffName}</span>
                      <span className="font-mono text-muted-foreground">
                        {staff.totalHours} / {staff.desiredWeeklyHours}h
                      </span>
                      <span
                        className={`text-right font-mono ${Math.abs(delta) >= 8 ? "text-[var(--warning-fg)]" : "text-muted-foreground"}`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section
              className="h-fit border bg-white"
              aria-labelledby="audit-heading"
            >
              <div className="border-b bg-[var(--color-deep-water)] px-4 py-4 text-white">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/60">
                  Admin evidence
                </p>
                <h2
                  id="audit-heading"
                  className="mt-1 font-heading text-xl uppercase tracking-wide"
                >
                  Audit export
                </h2>
              </div>
              <form
                action="/api/admin/audit/export"
                method="get"
                className="grid gap-4 p-4"
              >
                <label className="grid gap-1 text-xs font-semibold">
                  Location scope
                  <select
                    name="locationId"
                    defaultValue={admin ? "" : location.id}
                    className="h-10 border border-[var(--border-strong)] bg-white px-3 text-sm font-normal"
                  >
                    {admin ? <option value="">All locations</option> : null}
                    {availableLocations.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-semibold">
                    From
                    <input
                      type="date"
                      name="startDate"
                      className="h-10 min-w-0 border border-[var(--border-strong)] px-2 font-mono text-xs"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    Through
                    <input
                      type="date"
                      name="endDate"
                      className="h-10 min-w-0 border border-[var(--border-strong)] px-2 font-mono text-xs"
                    />
                  </label>
                </div>
                <button className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/85">
                  <Download className="size-4" />
                  Download scoped CSV
                </button>
                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  The export records its filters and row count in the
                  append-only audit trail.
                </p>
              </form>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function LedgerMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="border-b px-4 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl uppercase">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReportHeader({
  id,
  eyebrow,
  title,
  note,
}: {
  id: string;
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <header className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
          {eyebrow}
        </p>
        <h2 id={id} className="mt-1 font-heading text-2xl uppercase">
          {title}
        </h2>
      </div>
      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        {note}
      </p>
    </header>
  );
}

function HoursBar({ total, overtime }: { total: number; overtime: number }) {
  const scale = 50;
  const standardWidth = Math.min(100, (Math.min(total, 40) / scale) * 100);
  const overtimeWidth = Math.min(20, (overtime / scale) * 100);
  return (
    <div
      className="relative h-7 border bg-[var(--surface-subtle)]"
      aria-label={`${total} scheduled hours, ${overtime} overtime hours`}
    >
      <div
        className="absolute inset-y-0 left-0 bg-[var(--color-sea-glass)]"
        style={{ width: `${standardWidth}%` }}
      />
      {overtime > 0 ? (
        <div
          className="absolute inset-y-0 bg-[var(--premium-bg)]"
          style={{ left: "80%", width: `${overtimeWidth}%` }}
        />
      ) : null}
      <span
        className="absolute inset-y-0 left-[70%] border-l border-dashed border-[var(--warning-fg)]"
        title="35-hour watch threshold"
      />
      <span
        className="absolute inset-y-0 left-[80%] border-l-2 border-[var(--text-strong)]"
        title="40-hour overtime threshold"
      />
    </div>
  );
}

function EmptyReports() {
  return (
    <div className="mt-7 border border-dashed bg-white px-6 py-14 text-center">
      <BarChart3 className="mx-auto size-8 text-primary" />
      <h2 className="mt-4 font-heading text-2xl uppercase">
        No reportable week
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Create a schedule week for an accessible location before reviewing labor
        evidence.
      </p>
      <a
        href="/schedule"
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        Return to schedule <ArrowRight className="size-4" />
      </a>
    </div>
  );
}

function ReportEmpty({ message }: { message: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
