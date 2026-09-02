export type ViolationSeverity = "BLOCK" | "WARNING";

export type ConstraintViolation = {
  code: string;
  severity: ViolationSeverity;
  message: string;
  details: Record<string, unknown>;
};

type Validity = { validFrom: string; validTo: string | null };
type AvailabilityRule = Validity & {
  weekday: number;
  startLocalTime: string;
  endLocalTime: string;
  timezone: string;
  active?: boolean;
};
type AvailabilityException = {
  exceptionDate: string;
  type: "unavailable" | "override";
  startLocalTime: string | null;
  endLocalTime: string | null;
  timezone: string;
};
type ExistingAssignment = {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type AssignmentEvaluationInput = {
  candidateStaff: {
    id: string;
    skills: (Validity & { skillId: string })[];
    certifications: (Validity & { locationId: string; status: string })[];
    availabilityRules: AvailabilityRule[];
    availabilityExceptions: AvailabilityException[];
    primaryTimezone: string;
  };
  candidateShift: {
    id: string;
    locationId: string;
    requiredSkillId: string;
    startsAt: Date;
    endsAt: Date;
    timezone?: string;
    headcount: number;
  };
  existingAssignments: ExistingAssignment[];
  activeAssignmentCount: number;
  managerOverride?: boolean;
};

type ZonedParts = { date: string; time: string; weekday: number };
const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
    weekday: weekdays[value("weekday")] ?? 1,
  };
}

const withinValidity = (date: string, record: Validity) =>
  record.validFrom <= date && (record.validTo === null || record.validTo >= date);
const hours = (start: Date, end: Date) => (end.getTime() - start.getTime()) / 3_600_000;
const active = (assignment: ExistingAssignment) => assignment.status === "assigned";

export function isShiftWithinAvailability(
  staff: Pick<AssignmentEvaluationInput["candidateStaff"], "availabilityRules" | "availabilityExceptions">,
  shift: Pick<AssignmentEvaluationInput["candidateShift"], "startsAt" | "endsAt">,
) {
  const unavailable = staff.availabilityExceptions.some((exception) => {
    const start = zonedParts(shift.startsAt, exception.timezone);
    return exception.type === "unavailable" && exception.exceptionDate === start.date;
  });
  if (unavailable) return false;

  const windows = [
    ...staff.availabilityRules.filter((rule) => rule.active !== false).map((rule) => ({ ...rule, type: "rule" as const })),
    ...staff.availabilityExceptions.filter((exception) => exception.type === "override" && exception.startLocalTime && exception.endLocalTime).map((exception) => ({
      weekday: 0,
      startLocalTime: exception.startLocalTime!,
      endLocalTime: exception.endLocalTime!,
      timezone: exception.timezone,
      validFrom: exception.exceptionDate,
      validTo: exception.exceptionDate,
      type: "exception" as const,
    })),
  ];

  return windows.some((window) => {
    const start = zonedParts(shift.startsAt, window.timezone);
    const end = zonedParts(shift.endsAt, window.timezone);
    if (!withinValidity(start.date, window)) return false;
    if (window.type === "rule" && start.weekday !== window.weekday) return false;
    const windowStart = window.startLocalTime.slice(0, 5);
    const windowEnd = window.endLocalTime.slice(0, 5);
    const shiftStart = start.time.slice(0, 5);
    const shiftEnd = end.time.slice(0, 5);
    const overnight = windowEnd < windowStart;
    if (!overnight) return start.date === end.date && shiftStart >= windowStart && shiftEnd <= windowEnd;
    const nextDate = addDays(start.date, 1);
    return shiftStart >= windowStart && end.date === nextDate && shiftEnd <= windowEnd;
  });
}

function isAvailable(input: AssignmentEvaluationInput) {
  return isShiftWithinAvailability(input.candidateStaff, input.candidateShift);
}

function addDays(date: string, count: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - weekday + 1);
  return value.toISOString().slice(0, 10);
}

export function evaluateAssignment(input: AssignmentEvaluationInput) {
  const blockers: ConstraintViolation[] = [];
  const warnings: ConstraintViolation[] = [];
  const { candidateStaff: staff, candidateShift: shift } = input;
  const qualificationDate = zonedParts(shift.startsAt, shift.timezone ?? staff.primaryTimezone).date;
  const staffDate = zonedParts(shift.startsAt, staff.primaryTimezone).date;
  const add = (target: ConstraintViolation[], code: string, severity: ViolationSeverity, message: string, details: Record<string, unknown> = {}) =>
    target.push({ code, severity, message, details });

  if (!staff.skills.some((skill) => skill.skillId === shift.requiredSkillId && withinValidity(qualificationDate, skill))) {
    add(blockers, "MISSING_SKILL", "BLOCK", "Staff member does not hold the required skill.", { requiredSkillId: shift.requiredSkillId });
  }
  if (!staff.certifications.some((certification) => certification.locationId === shift.locationId && certification.status === "active" && withinValidity(qualificationDate, certification))) {
    add(blockers, "LOCATION_NOT_CERTIFIED", "BLOCK", "Staff member is not certified for this location.", { locationId: shift.locationId });
  }
  if (!isAvailable(input)) {
    add(blockers, "OUTSIDE_AVAILABILITY", "BLOCK", "Shift falls outside the staff member’s availability.", { shiftId: shift.id });
  }

  const assignments = input.existingAssignments.filter(active);
  const overlapping = assignments.find((existing) => existing.startsAt < shift.endsAt && shift.startsAt < existing.endsAt);
  if (overlapping) {
    add(blockers, "SHIFT_OVERLAP", "BLOCK", "Shift overlaps an existing assignment.", { conflictingShiftId: overlapping.shiftId });
  }
  const insufficientRest = assignments
    .map((existing) => ({
      existing,
      gap: shift.startsAt >= existing.endsAt
        ? hours(existing.endsAt, shift.startsAt)
        : existing.startsAt >= shift.endsAt ? hours(shift.endsAt, existing.startsAt) : -1,
    }))
    .filter(({ gap }) => gap >= 0 && gap < 10)
    .sort((a, b) => a.gap - b.gap)[0];
  if (insufficientRest) {
    add(blockers, "INSUFFICIENT_REST", "BLOCK", "There are fewer than 10 hours between shifts.", {
      adjacentShiftId: insufficientRest.existing.shiftId,
      actualRestHours: insufficientRest.gap,
      requiredRestHours: 10,
    });
  }

  const candidateHours = hours(shift.startsAt, shift.endsAt);
  const dailyExisting = assignments.filter((assignment) => zonedParts(assignment.startsAt, staff.primaryTimezone).date === staffDate);
  const projectedDailyHours = dailyExisting.reduce((total, assignment) => total + hours(assignment.startsAt, assignment.endsAt), candidateHours);
  if (projectedDailyHours > 12) {
    add(blockers, "DAILY_HARD_LIMIT", "BLOCK", "Assignment would exceed the 12-hour daily limit.", { projectedDailyHours, hardLimitHours: 12 });
  } else if (projectedDailyHours > 8) {
    add(warnings, "DAILY_HOURS_WARNING", "WARNING", "Assignment would exceed eight hours in one workday.", { projectedDailyHours, warningThresholdHours: 8 });
  }

  const candidateWeek = mondayFor(staffDate);
  const projectedWeeklyHours = assignments
    .filter((assignment) => mondayFor(zonedParts(assignment.startsAt, staff.primaryTimezone).date) === candidateWeek)
    .reduce((total, assignment) => total + hours(assignment.startsAt, assignment.endsAt), candidateHours);
  if (projectedWeeklyHours >= 35 && projectedWeeklyHours < 40) {
    add(warnings, "WEEKLY_HOURS_WARNING", "WARNING", "Assignment brings projected weekly hours to the warning threshold.", { projectedWeeklyHours, warningThresholdHours: 35 });
  } else if (projectedWeeklyHours >= 40) {
    add(warnings, "WEEKLY_HOURS_WARNING", "WARNING", "Assignment creates projected overtime.", { projectedWeeklyHours, overtimeThresholdHours: 40 });
  }

  const workedDays = new Set(assignments.map((assignment) => zonedParts(assignment.startsAt, staff.primaryTimezone).date));
  workedDays.add(staffDate);
  let projectedConsecutiveDays = 1;
  while (workedDays.has(addDays(staffDate, -projectedConsecutiveDays))) projectedConsecutiveDays += 1;
  let followingDays = 1;
  while (workedDays.has(addDays(staffDate, followingDays))) followingDays += 1;
  projectedConsecutiveDays += followingDays - 1;
  if (projectedConsecutiveDays >= 7 && !input.managerOverride) {
    add(blockers, "SEVENTH_DAY_OVERRIDE_REQUIRED", "BLOCK", "A seventh consecutive workday requires a documented manager override.", { projectedConsecutiveDays });
  } else if (projectedConsecutiveDays >= 6) {
    add(warnings, "SIXTH_DAY_WARNING", "WARNING", "Assignment creates a sixth consecutive workday.", { projectedConsecutiveDays });
  }

  if (input.activeAssignmentCount >= shift.headcount) {
    add(blockers, "HEADCOUNT_REACHED", "BLOCK", "All required positions for this shift are already filled.", { activeAssignmentCount: input.activeAssignmentCount, headcount: shift.headcount });
  }

  return {
    blockers,
    warnings,
    impact: {
      projectedDailyHours,
      projectedWeeklyHours,
      projectedConsecutiveDays,
      overtime: projectedWeeklyHours >= 40,
    },
  };
}
