import { describe, it, expect } from "vitest";

/**
 * Slice 2 — Pure Constraint Engine
 *
 * Seam: evaluateAssignment(input) -> ConstraintResult
 *
 * Capability: Given a candidate staff member and shift, returns structured
 * blockers, warnings, and projected labor impact without any database access.
 * This is the shared rule engine used by both preview and final assignment.
 *
 * Observable behavior:
 *   - Missing required skill → BLOCK MISSING_SKILL.
 *   - Missing location certification → BLOCK LOCATION_NOT_CERTIFIED.
 *   - Shift outside availability → BLOCK OUTSIDE_AVAILABILITY.
 *   - Overlapping active assignment → BLOCK SHIFT_OVERLAP.
 *   - Less than 10h rest from adjacent shift → BLOCK INSUFFICIENT_REST.
 *   - Daily hours > 12h → BLOCK DAILY_HARD_LIMIT.
 *   - Daily hours > 8h → WARNING.
 *   - Weekly hours >= 40h → OVERTIME projection.
 *   - 6th consecutive day → WARNING SIXTH_DAY_WARNING.
 *   - 7th consecutive day without override → BLOCK SEVENTH_DAY_OVERRIDE_REQUIRED.
 *   - Headcount already filled → BLOCK HEADCOUNT_REACHED.
 *   - Clean assignment → no blockers, with projected impact.
 *   - Timezone-aware availability: Pacific availability tested against Eastern shift.
 *
 * Design-spec reference: §3.12–3.16, §7 Critical Business Rules, §12.2 Vitest tests.
 * Test layer: Vitest (pure logic, no database).
 */

describe("Constraint engine — evaluateAssignment", () => {
  // ─── Skill constraint ────────────────────────────────────────────

  it("blocks assignment when staff lacks the required skill", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-bar", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-1",
        locationId: "loc-1",
        requiredSkillId: "skill-server", // staff does NOT have this skill
        startsAt: new Date("2025-09-01T21:00:00Z"), // Monday 5 PM ET
        endsAt: new Date("2025-09-02T01:00:00Z"),   // Monday 9 PM ET
        headcount: 1,
      },
      existingAssignments: [],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "MISSING_SKILL" })
    );
  });

  // ─── Location certification constraint ───────────────────────────

  it("blocks assignment when staff lacks location certification", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [], // no certification for the shift location
        availabilityRules: [{ weekday: 1, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-1",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T21:00:00Z"),
        endsAt: new Date("2025-09-02T01:00:00Z"),
        headcount: 1,
      },
      existingAssignments: [],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "LOCATION_NOT_CERTIFIED" })
    );
  });

  // ─── Availability constraint ─────────────────────────────────────

  it("blocks assignment when shift falls outside availability", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    // Staff is available Mon 09:00–17:00 ET, shift is Mon 5 PM–9 PM ET (outside)
    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "09:00", endLocalTime: "17:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-1",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T21:00:00Z"), // 5 PM ET — available until 5 PM
        endsAt: new Date("2025-09-02T01:00:00Z"),   // 9 PM ET — outside window
        headcount: 1,
      },
      existingAssignments: [],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "OUTSIDE_AVAILABILITY" })
    );
  });

  // ─── Overlap constraint ──────────────────────────────────────────

  it("blocks assignment when staff has an overlapping active assignment", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "06:00", endLocalTime: "23:59", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-new",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T18:00:00Z"), // 2 PM ET
        endsAt: new Date("2025-09-01T22:00:00Z"),   // 6 PM ET
        headcount: 1,
      },
      existingAssignments: [
        {
          shiftId: "shift-existing",
          startsAt: new Date("2025-09-01T17:00:00Z"), // 1 PM ET
          endsAt: new Date("2025-09-01T21:00:00Z"),   // 5 PM ET — overlaps with candidate
          status: "assigned",
        },
      ],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "SHIFT_OVERLAP" })
    );
  });

  // ─── Minimum rest constraint ─────────────────────────────────────

  it("blocks assignment when rest gap is less than 10 hours", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    // Existing shift ends at 3 AM ET on Tuesday, candidate starts 11 AM ET same day (8h gap)
    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [
          { weekday: 1, startLocalTime: "06:00", endLocalTime: "23:59", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 2, startLocalTime: "06:00", endLocalTime: "23:59", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
        ],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-new",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-02T15:00:00Z"), // Tue 11 AM ET
        endsAt: new Date("2025-09-02T21:00:00Z"),   // Tue 5 PM ET
        headcount: 1,
      },
      existingAssignments: [
        {
          shiftId: "shift-prev",
          startsAt: new Date("2025-09-01T23:00:00Z"), // Mon 7 PM ET
          endsAt: new Date("2025-09-02T07:00:00Z"),   // Tue 3 AM ET
          status: "assigned",
        },
      ],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "INSUFFICIENT_REST",
        details: expect.objectContaining({
          requiredRestHours: 10,
        }),
      })
    );
  });

  // ─── Daily hours hard block ──────────────────────────────────────

  it("blocks assignment when daily hours exceed 12h", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    // Existing 8h shift + candidate 5h shift = 13h on same day → hard block
    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "06:00", endLocalTime: "23:59", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-new",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T22:00:00Z"), // Mon 6 PM ET
        endsAt: new Date("2025-09-02T03:00:00Z"),   // Mon 11 PM ET (5h shift, starts on Mon in ET)
        headcount: 1,
      },
      existingAssignments: [
        {
          shiftId: "shift-morning",
          startsAt: new Date("2025-09-01T12:00:00Z"), // Mon 8 AM ET
          endsAt: new Date("2025-09-01T20:00:00Z"),   // Mon 4 PM ET (8h)
          status: "assigned",
        },
      ],
      activeAssignmentCount: 0,
    });

    // Total = 8h + 5h = 13h → DAILY_HARD_LIMIT
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "DAILY_HARD_LIMIT" })
    );
  });

  // ─── Weekly hours overtime projection ────────────────────────────

  it("reports overtime when weekly hours reach 40h", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    // 34h existing + 6h candidate = 40h → overtime
    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [
          { weekday: 5, startLocalTime: "06:00", endLocalTime: "23:59", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
        ],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-new",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-05T14:00:00Z"), // Fri 10 AM ET
        endsAt: new Date("2025-09-05T20:00:00Z"),   // Fri 4 PM ET (6h)
        headcount: 1,
      },
      existingAssignments: [
        // 34 hours already assigned earlier in the week (Mon–Thu, various shifts)
        { shiftId: "s1", startsAt: new Date("2025-09-01T13:00:00Z"), endsAt: new Date("2025-09-01T22:00:00Z"), status: "assigned" }, // 9h Mon
        { shiftId: "s2", startsAt: new Date("2025-09-02T13:00:00Z"), endsAt: new Date("2025-09-02T22:00:00Z"), status: "assigned" }, // 9h Tue
        { shiftId: "s3", startsAt: new Date("2025-09-03T13:00:00Z"), endsAt: new Date("2025-09-03T21:00:00Z"), status: "assigned" }, // 8h Wed
        { shiftId: "s4", startsAt: new Date("2025-09-04T13:00:00Z"), endsAt: new Date("2025-09-04T21:00:00Z"), status: "assigned" }, // 8h Thu
      ],
      activeAssignmentCount: 0,
    });

    // 34 + 6 = 40 → overtime
    expect(result.impact.projectedWeeklyHours).toBe(40);
    expect(result.impact.overtime).toBe(true);
  });

  // ─── Consecutive days — 7th day block ────────────────────────────

  it("blocks a 7th consecutive day without override", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    // Staff has worked Mon–Sat (6 days), candidate shift is on Sunday
    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [
          { weekday: 1, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 2, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 3, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 4, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 5, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 6, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
          { weekday: 7, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null },
        ],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-sun",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-07T14:00:00Z"), // Sun 10 AM ET
        endsAt: new Date("2025-09-07T20:00:00Z"),   // Sun 4 PM ET
        headcount: 1,
      },
      existingAssignments: [
        { shiftId: "s-mon", startsAt: new Date("2025-09-01T14:00:00Z"), endsAt: new Date("2025-09-01T22:00:00Z"), status: "assigned" },
        { shiftId: "s-tue", startsAt: new Date("2025-09-02T14:00:00Z"), endsAt: new Date("2025-09-02T22:00:00Z"), status: "assigned" },
        { shiftId: "s-wed", startsAt: new Date("2025-09-03T14:00:00Z"), endsAt: new Date("2025-09-03T22:00:00Z"), status: "assigned" },
        { shiftId: "s-thu", startsAt: new Date("2025-09-04T14:00:00Z"), endsAt: new Date("2025-09-04T22:00:00Z"), status: "assigned" },
        { shiftId: "s-fri", startsAt: new Date("2025-09-05T14:00:00Z"), endsAt: new Date("2025-09-05T22:00:00Z"), status: "assigned" },
        { shiftId: "s-sat", startsAt: new Date("2025-09-06T14:00:00Z"), endsAt: new Date("2025-09-06T22:00:00Z"), status: "assigned" },
      ],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "SEVENTH_DAY_OVERRIDE_REQUIRED" })
    );
  });

  // ─── Headcount constraint ────────────────────────────────────────

  it("blocks assignment when shift headcount is already reached", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "06:00", endLocalTime: "22:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-1",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T14:00:00Z"),
        endsAt: new Date("2025-09-01T22:00:00Z"),
        headcount: 2,
      },
      existingAssignments: [],
      activeAssignmentCount: 2, // headcount already filled by other staff
    });

    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "HEADCOUNT_REACHED" })
    );
  });

  // ─── Timezone-aware availability (Timezone Tangle) ───────────────

  it("evaluates availability in the rule's timezone, not the shift's location timezone", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    // Staff has Pacific availability 09:00–17:00 PT
    // Shift is at an Eastern location: 15:00–21:00 UTC = 11 AM–5 PM ET = 8 AM–2 PM PT
    // 8 AM PT is BEFORE 9 AM PT availability start → BLOCKED
    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-east", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "09:00", endLocalTime: "17:00", timezone: "America/Los_Angeles", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/Los_Angeles",
      },
      candidateShift: {
        id: "shift-east",
        locationId: "loc-east",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T15:00:00Z"), // 11 AM ET = 8 AM PT
        endsAt: new Date("2025-09-01T21:00:00Z"),   // 5 PM ET = 2 PM PT
        headcount: 1,
      },
      existingAssignments: [],
      activeAssignmentCount: 0,
    });

    // 8 AM PT is before 9 AM PT start → should be blocked
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "OUTSIDE_AVAILABILITY" })
    );
  });

  // ─── Clean assignment — no blockers, projected impact ────────────

  it("returns no blockers and projected impact for a valid assignment", async () => {
    const { evaluateAssignment } = await import(
      "@/server/scheduling/constraints"
    );

    const result = evaluateAssignment({
      candidateStaff: {
        id: "staff-1",
        skills: [{ skillId: "skill-server", validFrom: "2025-01-01", validTo: null }],
        certifications: [{ locationId: "loc-1", validFrom: "2025-01-01", validTo: null, status: "active" }],
        availabilityRules: [{ weekday: 1, startLocalTime: "06:00", endLocalTime: "23:00", timezone: "America/New_York", validFrom: "2025-01-01", validTo: null }],
        availabilityExceptions: [],
        primaryTimezone: "America/New_York",
      },
      candidateShift: {
        id: "shift-1",
        locationId: "loc-1",
        requiredSkillId: "skill-server",
        startsAt: new Date("2025-09-01T14:00:00Z"), // Mon 10 AM ET
        endsAt: new Date("2025-09-01T22:00:00Z"),   // Mon 6 PM ET (8h)
        headcount: 2,
      },
      existingAssignments: [],
      activeAssignmentCount: 0,
    });

    expect(result.blockers).toHaveLength(0);
    expect(result.impact).toEqual(
      expect.objectContaining({
        projectedDailyHours: 8,
        projectedWeeklyHours: 8,
        projectedConsecutiveDays: 1,
        overtime: false,
      })
    );
  });
});
