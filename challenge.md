## Project: ShiftSync — Multi-Location Staff Scheduling Platform

---

## Overview

Build a web-based shift scheduling platform for a fictional restaurant group ("Coastal Eats") that operates **4 locations** across **2 time zones**. The platform must handle the inherent complexity of real-world workforce scheduling while remaining intuitive for both managers and staff.

---

## Business Context

Coastal Eats struggles with:

- Staff frequently calling out with no coverage
- Overtime costs spiraling due to poor visibility
- Employees complaining about unfair shift distribution
- Managers at different locations hoarding "good" employees
- No central view of who's working where and when

Your solution must address these pain points.

---

## Core Functional Requirements

### 1. User Management & Roles

**Three user types exist:**

| Role        | Description                              |
| ----------- | ---------------------------------------- |
| **Admin**   | Corporate oversight across all locations |
| **Manager** | Runs one or more specific locations      |
| **Staff**   | Works shifts at one or more locations    |

- Staff members can be certified to work at multiple locations
- Staff have **skills** (e.g., "bartender", "line cook", "server", "host")
- Staff have **availability windows** they set themselves (recurring weekly + one-off exceptions)
- Managers can only see/manage locations they're assigned to
- Admins see everything

---

### 2. Shift Scheduling

**Managers must be able to:**

- Create shifts with: location, date/time, required skill, and headcount needed
- Assign specific staff to shifts manually
- Publish a week's schedule (making it visible to staff)
- Unpublish/edit a schedule before a configurable cutoff (default: 48 hours before the shift)

**The system must enforce:**

- No double-booking (same person, overlapping times, even across locations)
- Minimum **10 hours** between the end of one shift and start of another for the same person
- Staff can only be assigned to shifts requiring skills they possess
- Staff can only be assigned to locations they're certified for
- Staff can only be assigned during their available hours

**When a constraint is violated:**

- The system must **clearly explain which rule was broken and why**
- The system should **suggest alternatives** when possible (e.g., "Sarah is unavailable, but John and Maria have the required skill and availability")

---

### 3. Shift Swapping & Coverage

**Staff can:**

- Request to swap a shift with another qualified staff member
- Offer a shift up for grabs ("drop request")
- Pick up available shifts they're qualified for

**Swap/coverage workflow:**

1. Staff A requests swap or drop
2. If swap: Staff B must accept
3. Manager must approve the final change
4. All parties are notified at each step
5. Original assignment remains until manager approval

**Edge case requirements:**

- If a swap is pending and the manager edits that shift, the swap request should be automatically cancelled with notification
- A staff member cannot have more than **3 pending swap/drop requests** at once
- Drop requests expire **24 hours** before the shift starts if unclaimed

---

### 4. Overtime & Labor Law Compliance

**The system must track and warn about:**

- Weekly hours approaching **40 hours** (warning at 35+)
- Daily hours exceeding **8 hours** (warning) or **12 hours** (hard block)
- **6th consecutive day** worked in a week (warning)
- **7th consecutive day** worked in a week (requires manager override with documented reason)

**Overtime visualization:**

- Dashboard showing projected overtime costs for the week
- Highlighting which specific assignments are pushing staff into overtime
- Ability to see "what-if" impact before confirming an assignment

---

### 5. Schedule Fairness Analytics

**The system must provide:**

- Distribution report showing hours assigned per staff member over a selected period
- "Desirable shift" tracking — shifts on Friday/Saturday evenings are tagged as premium
- Fairness score showing whether premium shifts are distributed equitably
- Managers can see which staff members have been under/over-scheduled relative to their stated desired hours

---

### 6. Real-Time Features

- When a manager publishes or modifies a schedule, affected staff should see updates **without refreshing**
- When a swap request is submitted or resolved, relevant parties should be notified **in real-time**
- An "on-duty now" dashboard showing who is currently clocked into a shift at each location, updating live
- If two managers try to assign the same staff member simultaneously, one should see a conflict notification immediately

---

### 7. Notifications & Communication

- Staff receive notifications for: new shifts assigned, shift changes, swap request updates, schedule published
- Managers receive notifications for: swap/drop requests needing approval, overtime warnings, staff availability changes
- Users configure their notification preferences (in-app only, or in-app + email simulation)
- All notifications are persisted and viewable in a notification center with read/unread status

---

### 8. Calendar & Time Handling

- All times must be stored and processed correctly regardless of user timezone
- Users see times displayed **in the location's timezone** for that shift
- Recurring availability must handle daylight saving time transitions correctly
- A shift starting at 11pm and ending at 3am must be handled as a single shift (overnight)

---

### 9. Audit Trail

- All schedule changes must be logged: who made the change, when, what the before/after state was
- Managers can view the history of any shift
- Admins can export audit logs for any date range and location

---

## Evaluation Scenarios

The evaluator will test your system with these scenarios (among others):

1. **The Sunday Night Chaos**: A staff member calls out at 6pm Sunday for a 7pm shift. Walk through the fastest path to finding coverage.
2. **The Overtime Trap**: A manager tries to build a schedule where they don't realize one employee would hit 52 hours. How does the system help?
3. **The Timezone Tangle**: A staff member is certified at a location in Pacific time and another in Eastern time. They set availability as "9am-5pm". What happens?
4. **The Simultaneous Assignment**: Two managers both try to assign the same bartender to different locations at the same time. What happens?
5. **The Fairness Complaint**: An employee claims they never get Saturday night shifts. How does a manager verify or refute this?
6. **The Regret Swap**: Staff A and B request a swap. The manager hasn't approved it yet. Staff A changes their mind. What are the implications?

---

## Deliverables

1. **Working Application** — Deployed to a publicly accessible URL
2. **Source Code** — Public GitHub Repository with commit history
3. **Seed Data** — Pre-populated with realistic test data covering edge cases (multiple locations, staff with various skills, existing schedule with some conflicts)
4. **Brief Documentation** — How to log in as each role, any known limitations, and any assumptions you made where requirements were ambiguous
5. This should be sent to your hiring managers email before/at the time of the 72 hour deadline

---

## Evaluation Criteria

| Area                                       | Weight |
| ------------------------------------------ | ------ |
| Constraint enforcement correctness         | 25%    |
| Edge case handling                         | 20%    |
| Real-time functionality                    | 15%    |
| User experience & clarity of feedback      | 15%    |
| Data integrity under concurrent operations | 15%    |
| Code organization & maintainability        | 10%    |

---

## Intentional Ambiguities

The following are **deliberately unspecified**. Part of the evaluation is how you choose to handle them:

- What happens to historical data when a staff member is de-certified from a location?
- How should "desired hours" interact with availability windows?
- When calculating consecutive days, does a 1-hour shift count the same as an 11-hour shift?
- If a shift is edited after swap approval but before it occurs, what should happen?
- How should the system handle a location that spans a timezone boundary (e.g., a restaurant near a state line)?

Document your decisions.

---

## Time Limit

**72 hours** from receipt of this document.

---

Good luck.
