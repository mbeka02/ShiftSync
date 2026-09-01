# ShiftSync — Harbor Calm Design System

**Product:** ShiftSync, a multi-location restaurant staff scheduling platform  
**Organization:** Coastal Eats  
**Direction:** Harbor Calm, refined for restaurant operations  
**Status:** Implementation-ready visual and interaction specification  
**Primary audiences:** Restaurant managers, hourly staff, and corporate administrators

---

## 1. Design Position

ShiftSync should feel like a calm operations surface in the middle of a busy service: precise enough for a manager making consequential scheduling decisions, direct enough for a staff member checking a shift between tasks, and credible enough for an administrator reviewing labor and fairness evidence.

The product is not a lifestyle hospitality site and should not imitate a generic analytics dashboard. Its visual language comes from the restaurant's working environment:

- an expo rail that puts the next important item in view;
- order tickets that separate facts, exceptions, and actions clearly;
- shift boards that favor scanning over decoration;
- stainless, sea-glass, ink, amber, and signal colors associated with Coastal Eats;
- explicit timestamps, location labels, and state changes that prevent operational ambiguity.

### 1.1 Subject, audience, and job

**Concrete subject:** Coordinating people, coverage, labor constraints, and approvals across four Coastal Eats restaurants in two time zones.

**Primary audience:** Managers working on laptops or tablets while service is active. They are time-constrained, interruption-prone, and accountable for coverage, labor cost, and fair treatment.

**Secondary audience:** Hourly staff using phones to check schedules, set availability, request coverage, accept swaps, and understand whether they are still responsible for a shift.

**Tertiary audience:** Corporate administrators comparing locations, investigating fairness concerns, and reviewing audit evidence on desktop.

**The interface's single job:** Make the current staffing truth obvious and make the safest next action fast.

### 1.2 Experience qualities

ShiftSync should be:

- **Calm under pressure:** urgency is unmistakable without turning every screen red.
- **Operational, not bureaucratic:** the interface speaks in shifts, people, locations, coverage, and hours.
- **Explainable:** a warning always identifies the rule, actual value, threshold, and available next step.
- **Locally grounded:** location and timezone remain visible wherever they affect a decision.
- **Fair by evidence:** analytics show the shifts and opportunity counts behind a conclusion.
- **Dense but breathable:** manager screens support rapid comparison; staff screens favor focused, touch-friendly tasks.

---

## 2. Harbor Calm Evaluation

### 2.1 What the original direction gets right

| Choice | Fit with ShiftSync |
|---|---|
| Calm teal and deep navy foundation | Appropriate for Coastal Eats and for reducing visual stress during urgent coverage work. |
| Moderate density | Supports schedule comparison without making the system feel like a spreadsheet clone. |
| Amber warnings and coral accents | Provides enough warmth to avoid a sterile enterprise appearance. |
| Small corner radii and quiet surfaces | Friendly enough for staff while retaining operational credibility. |
| 4px spacing foundation | Supports both dense schedule grids and touch-friendly staff workflows. |
| Role-flexible visual language | Allows managers, staff, and admins to share one recognizable product rather than three separate themes. |

### 2.2 What needs refinement

| Original issue | Decision |
|---|---|
| DM Sans used for every typographic role feels like a generic SaaS default. | Keep DM Sans for UI legibility, add Barlow Condensed for restrained operational headings and IBM Plex Mono for time, hours, money, and timezone data. |
| The coastal identity is primarily expressed through color. | Ground the system in restaurant operations through the Service Rail, ticket-like conflict explanations, coverage counts, and expo-board layout behavior. |
| Coral is close to both a hospitality accent and an error color. | Reserve Signal Coral strictly for destructive or blocked states; use Galley Amber/Brass for premium shifts and attention states. |
| Rounded cards can make dense screens feel soft and fragmented. | Use cards only for independent units. Schedule and analytics screens use continuous boards, ruled sections, and attached inspectors. |
| A 46px schedule row is comfortable but expensive at scale. | Provide 40px compact and 48px comfortable density modes on manager boards; keep 44px minimum interactive targets. |
| Status chips could become the default representation for every value. | Limit chips to categorical state. Present hours, time, coverage, and costs as aligned data, not pills. |

### 2.3 Verdict

Harbor Calm is the right base direction because ShiftSync needs confidence without aggression and hospitality without sentimentality. The refined version should be more operational and less conventionally polished: restrained type, thin rules, aligned numbers, clear shift blocks, and one memorable Service Rail rather than a collection of decorative cards.

---

## 3. Design Principles

### 3.1 Show staffing truth before controls

Every scheduling view begins with the current state: location, local timezone, week or date, publication state, coverage gaps, and live changes. Controls follow this context rather than competing with it.

### 3.2 Explain the decision, not just the status

`Blocked` alone is insufficient. A constraint message states:

1. what cannot happen;
2. which rule was violated;
3. the actual and required values;
4. whether an override exists;
5. the best available alternative.

### 3.3 Use urgency proportionally

- Routine information stays neutral.
- A forecast or approaching threshold uses amber.
- A hard blocker or destructive action uses coral red.
- A successful committed change uses green.
- A live/stale state uses blue.

Large colored surfaces are reserved for states that genuinely interrupt the workflow.

### 3.4 Keep place and time attached

Dates, times, and availability are never shown without enough location/timezone context to interpret them correctly. Users who span time zones see abbreviations on every shift. Overnight shifts remain one visual object.

### 3.5 Design for interruption

Managers may leave and return to a drawer or modal after the underlying data changes. Long-lived decision surfaces show freshness, react to realtime changes, and prevent submission of stale choices.

### 3.6 Evidence over scores

Overtime and fairness summaries link to the assignments that produced them. A score is an entry point, not the final answer.

---

## 4. Signature Element — The Service Rail

The system's single aesthetic risk is a persistent **Service Rail** inspired by the ticket rail at a restaurant pass. It turns live operational pressure into a concise, horizontal sequence rather than a generic row of KPI cards.

```text
┌ SERVICE RAIL · HARBOR EAST · 6:08 PM ET ─────────────────────────────┐
│ NOW  Dinner service  12/13 covered  │ NEXT  Bartender · 7 PM · OPEN │
│ WAITING  2 approvals                │ WATCH  Maria · 38h projected   │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.1 Purpose

The rail answers four questions in one glance:

- What service period is active now?
- Is the location currently covered?
- What is the next unresolved staffing risk?
- Which approval or labor threshold needs attention?

### 4.2 Behavior

- Appears below the page/context header on manager Schedule, Coverage, and On Duty views.
- Shows a maximum of four items: `Now`, `Next`, `Waiting`, and `Watch`.
- Sorts unresolved items by time-to-impact, then severity.
- Clicking an item opens its shift, request, or staff-hours inspector.
- New realtime information enters with one 160ms lateral reveal and then becomes still.
- A changed item receives a single two-second outline emphasis; it never pulses indefinitely.
- When no item needs action, the rail says `All scheduled roles covered through 10:00 PM` rather than disappearing.
- On mobile it becomes a two-row summary with one primary issue and a `View all` action.

### 4.3 Restraint

The Service Rail is the product's memorable element. Ticket perforations, paper textures, nautical illustrations, ropes, waves, and other thematic decoration should not appear elsewhere. The reference is structural, not literal.

---

## 5. Color System

### 5.1 Core palette

| Token | Name | Hex | Role |
|---|---|---:|---|
| `--color-deep-water` | Deep Water | `#17343D` | Primary text, navigation, strong icons |
| `--color-sea-glass` | Sea Glass | `#176C68` | Primary action, selection, active navigation |
| `--color-mist` | Morning Mist | `#F3F7F6` | Application canvas |
| `--color-stainless` | Stainless | `#D9E4E2` | Rules, grid lines, boundaries |
| `--color-galley-amber` | Galley Amber | `#A96816` | Warnings, watch states, premium markers |
| `--color-signal-coral` | Signal Coral | `#A8443C` | Hard blockers, destructive actions, critical gaps |

These colors make the brand recognizable, but color must never be the only carrier of meaning.

### 5.2 Neutral and surface tokens

| Token | Value | Use |
|---|---:|---|
| `--surface-canvas` | `#F3F7F6` | Page background |
| `--surface-default` | `#FFFFFF` | Primary work surface |
| `--surface-subtle` | `#EAF1EF` | Selected rows, secondary panels |
| `--surface-inset` | `#E2ECE9` | Recessed rail or filters |
| `--text-strong` | `#17343D` | Headings and primary body text |
| `--text-default` | `#334F56` | Body copy |
| `--text-muted` | `#5B7177` | Metadata and supporting labels |
| `--text-disabled` | `#8A9A9E` | Disabled content only |
| `--border-default` | `#D9E4E2` | Standard boundaries |
| `--border-strong` | `#AFC3BF` | Table headers and active structure |

### 5.3 Semantic tokens

| State | Foreground | Background | Border | Required companion |
|---|---:|---:|---:|---|
| Success / committed | `#21654D` | `#E5F3EC` | `#A9D5C0` | Check icon or explicit verb |
| Info / live change | `#285F7A` | `#E6F1F6` | `#AACBDA` | Info/live icon and timestamp |
| Warning / soft threshold | `#744914` | `#FFF3D9` | `#E7C681` | Warning icon and threshold |
| Danger / hard block | `#82332D` | `#FBE9E7` | `#E3A29C` | Stop icon and rule name |
| Premium shift | `#69460F` | `#F9EDCE` | `#D8B86C` | Star icon and `Premium` label |
| Draft | `#53686E` | `#EDF1F1` | `#CBD5D4` | `Draft` label |

Signal Coral never marks premium shifts. Galley Amber can indicate both warning and premium contexts only when the icon and label make the distinction explicit.

### 5.4 Schedule-block colors

Shift blocks use pale, low-chroma fills so semantic warnings remain dominant. Skill is encoded by a 3px leading rail, short label, and optional icon—not fill color alone.

| Skill | Rail | Fill |
|---|---:|---:|
| Server | `#347A78` | `#E2F0ED` |
| Bartender | `#5B6F9C` | `#E9EDF6` |
| Line cook | `#9A6542` | `#F4EAE2` |
| Host | `#7A5C8F` | `#F0EAF4` |

An unfilled shift overrides skill styling with the danger border and `Open` label. A blocked candidate is not represented as a shift color.

### 5.5 Dark mode decision

The first release is light-first. Restaurant managers need predictable contrast on mixed-quality office displays, tablets, and bright back-of-house environments. Dark mode is not part of the 72-hour critical path. Token names remain theme-ready, but an untested automatic inversion must not ship.

---

## 6. Typography

Typography combines hospitality warmth with operational precision. It uses three narrowly defined roles rather than one family everywhere.

### 6.1 Families

| Role | Typeface | Weights | Use |
|---|---|---|---|
| Operational display | **Barlow Condensed** | 600 | Page titles, location names, day headers, Service Rail labels |
| Interface/body | **DM Sans** | 400, 500, 600 | Navigation, controls, forms, explanations, staff names |
| Data/utility | **IBM Plex Mono** | 400, 500 | Times, hours, costs, timezone abbreviations, change diffs, audit timestamps |

Barlow Condensed references menu boards and operations signage without becoming a restaurant theme. It is used sparingly; paragraphs and form labels remain DM Sans. IBM Plex Mono makes critical numerical comparisons stable and scannable.

### 6.2 Type scale

| Token | Font | Size / line-height | Weight | Use |
|---|---|---|---|---|
| `display-lg` | Barlow Condensed | `32 / 36px` | 600 | Major desktop page title |
| `display-md` | Barlow Condensed | `26 / 30px` | 600 | Mobile title, inspector heading |
| `heading-lg` | DM Sans | `20 / 28px` | 600 | Major section |
| `heading-md` | DM Sans | `16 / 24px` | 600 | Card/section heading |
| `body-md` | DM Sans | `14 / 21px` | 400 | Default UI copy |
| `body-sm` | DM Sans | `13 / 18px` | 400 | Dense tables and supporting text |
| `label` | DM Sans | `12 / 16px` | 600 | Form labels and column headings |
| `utility` | IBM Plex Mono | `12 / 16px` | 500 | Time, hours, timezone, money |
| `utility-sm` | IBM Plex Mono | `11 / 14px` | 500 | Dense grid metadata |

### 6.3 Typographic rules

- Use sentence case for navigation, headings, controls, and status text.
- Barlow Condensed may use uppercase only for short operational labels such as `NOW`, `NEXT`, and weekday abbreviations.
- Use tabular numerals for time, hours, headcount, cost, and audit data.
- Use an en dash for ranges: `5:00–11:00 PM`.
- Keep timezone abbreviations attached: `7:00 PM ET`.
- Use `34h → 40h`, not prose, when comparing before and after values.
- Never use light font weights; busy screens need durable letterforms.
- Avoid center alignment except empty states and compact metrics.

### 6.4 Font loading

Use `next/font/google` so fonts are self-hosted by the application build. Define each family as a CSS variable and load only the listed weights. Body text must fall back to `Arial, sans-serif`; data text falls back to `ui-monospace, monospace`.

---

## 7. Spacing, Shape, and Elevation

### 7.1 Spacing scale

The system uses a 4px base unit.

| Token | Value | Typical use |
|---|---:|---|
| `space-0.5` | `2px` | Optical alignment only |
| `space-1` | `4px` | Icon/label micro-gap |
| `space-2` | `8px` | Related inline items |
| `space-3` | `12px` | Compact control padding |
| `space-4` | `16px` | Default internal spacing |
| `space-6` | `24px` | Section separation |
| `space-8` | `32px` | Page-region separation |
| `space-12` | `48px` | Major empty-space boundary |

Do not introduce one-off values unless needed for a mathematically aligned grid.

### 7.2 Density modes

Manager schedule and analytics screens support two density settings:

- **Compact:** 40px table/schedule rows, 32px controls; optimized for desktop comparison.
- **Comfortable:** 48px rows, 40px controls; default for tablets and new users.

The density control changes data rows, not interactive target size. Icon buttons retain a minimum 44×44px pointer target through transparent hit area.

Staff mobile screens do not expose a density toggle and use at least 44px controls.

### 7.3 Radius

| Token | Value | Use |
|---|---:|---|
| `radius-sm` | `6px` | Buttons, inputs, shift blocks |
| `radius-md` | `10px` | Drawers, alerts, independent cards |
| `radius-lg` | `14px` | Modal shell only |
| `radius-pill` | `999px` | Categorical status and compact filters only |

Avoid nested rounded rectangles. A rounded outer container should generally contain square/ruled internal rows.

### 7.4 Borders and elevation

- Use 1px rules to define schedule cells, tables, and attached panels.
- Use 2px borders for selection, focus, or hard blockers.
- Use shadow only for overlays and surfaces that physically sit above the current task.
- Standard content cards do not float.
- Drawer shadow: `-12px 0 30px rgb(23 52 61 / 0.12)`.
- Modal shadow: `0 20px 60px rgb(23 52 61 / 0.18)`.

---

## 8. Layout System

### 8.1 App shell

Desktop uses a stable left navigation, a context header, and a fluid work surface.

```text
┌──────────────┬────────────────────────────────────────────────────────┐
│ ShiftSync    │ Harbor East  /  Schedule       Week Aug 17–23  [•••] │
│              ├────────────────────────────────────────────────────────┤
│ Schedule     │ SERVICE RAIL                                           │
│ Coverage     ├────────────────────────────────────────────┬───────────┤
│ Staff        │                                            │ Inspector │
│ Labor        │              Weekly board                  │ or closed │
│ Fairness     │                                            │           │
│ On duty      │                                            │           │
│              │                                            │           │
│ User         │                                            │           │
└──────────────┴────────────────────────────────────────────┴───────────┘
```

- Navigation: 224px expanded; 64px collapsed.
- Context header: 64px.
- Service Rail: 48–64px depending on content.
- Inspector: 360–420px and attached to the right edge.
- Work surface: no arbitrary maximum width on schedule boards; reports use a 1280px readable maximum.

### 8.2 Manager schedule layout

The weekly board is a continuous scheduling surface, not a collection of day cards.

```text
┌ Staff / role ┬ Mon 17 ┬ Tue 18 ┬ Wed 19 ┬ Thu 20 ┬ Fri 21 ┬ Sat 22 ┐
│ Maria Chen   │ 9–5    │        │ 5–11   │        │        │ 6–11 ★ │
│ Bartender    │        │        │        │        │        │         │
├──────────────┼────────┼────────┼────────┼────────┼────────┼─────────┤
│ John Rivera  │        │ 11–7   │        │ 4–10   │ 4–10   │         │
├──────────────┴────────┴────────┴────────┴────────┴────────┴─────────┤
│ Coverage        2/2      2/2      1/2 !    2/2      3/3      4/4 ★ │
└─────────────────────────────────────────────────────────────────────┘
```

- Sticky staff column and day header.
- One scroll direction at a time where possible; horizontal scroll appears only below the working breakpoint.
- The current day uses a subtle sea-glass rule, not a full tinted column.
- Overnight shifts show `11 PM–3 AM +1` as one block.
- Published shifts use solid edges; draft shifts use a dotted outer edge and `Draft` in accessible text.
- Open headcount appears as a deliberate empty slot labeled `1 open`, never as blank space.
- Location and timezone remain in the sticky context header.

### 8.3 Staff mobile layout

Staff see an agenda, not a compressed manager grid.

```text
┌ My schedule ─────────────── Sep 1–7 ┐
│ Next shift                           │
│ TODAY · HARBOR EAST · ET             │
│ 5:00–11:00 PM  Bartender             │
│ [View shift]                         │
├──────────────────────────────────────┤
│ Wed 2                                │
│ 4:00–10:00 PM · Harbor West · PT     │
├──────────────────────────────────────┤
│ Sat 5 · PREMIUM                      │
│ 6:00–11:00 PM · Harbor East · ET     │
└──────────────────────────────────────┘
```

The primary bottom navigation contains no more than five destinations: Schedule, Coverage, Availability, On duty, and Inbox.

### 8.4 Breakpoints

| Name | Width | Behavior |
|---|---:|---|
| Mobile | `< 640px` | Bottom navigation, agenda views, full-screen sheets |
| Tablet | `640–1023px` | Collapsed sidebar, comfortable density, overlay inspector |
| Desktop | `1024–1439px` | Full sidebar, attached inspector, schedule grid |
| Wide | `≥ 1440px` | Wider schedule canvas; inspector can remain open without covering data |

Breakpoints follow layout failure, not device names. All critical workflows must remain usable at 320px width.

---

## 9. Navigation and Context

### 9.1 Role-aware destinations

**Admin:** Overview, Locations, Schedules, Staff, Labor, Fairness, On duty, Audit, Inbox.

**Manager:** Schedule, Coverage, Staff, Labor, Fairness, On duty, Inbox.

**Staff:** Schedule, Coverage, Availability, On duty, Inbox.

Role determines available destinations, not the visual theme. This prevents staff and managers from feeling like they are using unrelated products.

### 9.2 Context header

The header contains:

- current location or `All locations`;
- location timezone;
- current period;
- publication state when relevant;
- connection/live state;
- page-level primary action.

Location switching is never hidden inside the user account menu. A manager with multiple locations sees the chosen location in every scheduling mutation.

### 9.3 Breadcrumb use

Use breadcrumbs only for genuine hierarchy such as `Staff / Maria Chen / Schedule history`. Do not show breadcrumbs on top-level operational views.

---

## 10. Component System

### 10.1 Buttons

| Variant | Use |
|---|---|
| Primary | One preferred action in a region: `Assign staff`, `Publish schedule` |
| Secondary | Safe alternative: `Save draft`, `View shift` |
| Quiet | Low-emphasis utility: `Clear filters`, `View history` |
| Danger | Destructive confirmed action: `Cancel request`, `Remove assignment` |
| Split | Primary action with closely related alternate, used sparingly |

Buttons use verb-first, outcome-specific labels. Avoid `Submit`, `Yes`, and `OK`.

Disabled buttons must be accompanied by visible explanatory text when a user could reasonably expect the action to be available.

### 10.2 Inputs and selectors

- Labels remain above fields; placeholders do not replace labels.
- Location and timezone selectors display both city/location name and abbreviation.
- Time inputs show the timezone within the control group.
- Validation appears adjacent to the field and in the summary when submission fails.
- Search inputs use `Search staff`, not a generic `Search`.
- Multi-select filters collapse into a readable sentence such as `Bartenders · Draft or open · 2 locations`.

### 10.3 Shift block

A shift block contains, in order:

1. time range;
2. required skill;
3. assignee or open headcount;
4. exceptional state only: warning, premium, pending change.

Minimum example:

```text
┌─ 5:00–11:00 PM ───────┐
│ Bartender              │
│ Maria Chen        ★    │
└────────────────────────┘
```

Do not show location inside every block when the entire board is scoped to one location. Do show it in search results, personal schedules, and cross-location views.

### 10.4 Candidate row

Candidate rows are comparison tools, not profile cards. They align qualification evidence into predictable columns.

```text
Maria Chen                 ELIGIBLE
Bartender · Harbor East    31h → 37h
Available · 12h rest       2 premium / 8 weeks
```

- Eligible candidates appear first and can be selected.
- Warning candidates remain selectable but disclose impact before confirmation.
- Blocked candidates remain visible below eligible candidates with the first blocker in the row.
- Expanding a row reveals all rule checks, including passing checks when useful.
- Sorting defaults to qualification, lowest risk, projected weekly hours, then fairness as a soft tie-breaker.

### 10.5 Constraint explanation panel

The panel follows a ticket-like hierarchy:

```text
CANNOT ASSIGN SARAH
Insufficient rest

Previous shift ends       12:00 PM
This shift starts          8:00 PM
Available rest                  8h
Required rest                  10h

Try instead
John Rivera · eligible · 34h projected
Maria Chen · eligible · 31h projected
```

- `Cannot assign Sarah` is the action outcome.
- `Insufficient rest` is the rule name.
- Actual and required values align in IBM Plex Mono.
- Alternatives are actionable rows, not passive prose.
- Multiple blockers are listed in severity order.

### 10.6 Alerts, banners, and toasts

**Inline alert:** belongs to a field, shift, candidate, or panel.  
**Banner:** affects an entire page or schedule, such as lost realtime connection.  
**Toast:** confirms a completed action and does not contain information needed later.  
**Notification center item:** persisted operational event requiring later reference.

Do not use a toast for a hard assignment conflict; the conflict belongs beside the decision surface.

### 10.7 Status chips

Allowed categorical chips include `Draft`, `Published`, `Pending approval`, `Accepted`, `Expired`, `Cancelled`, `Open`, and `Premium`.

Chips include text and may include an icon. Hours, costs, dates, and coverage ratios are never chips.

### 10.8 Drawers, sheets, and modals

- Use a right drawer for inspecting a shift, comparing candidates, or reviewing a staff member without losing board context.
- Use a full-screen sheet for the same tasks on mobile.
- Use a modal only for a focused decision that blocks the underlying workflow: publish, override, destructive cancellation.
- Complex forms belong on a page or drawer, not a modal.
- Preserve unsaved state when a realtime update arrives, then require recalculation.

### 10.9 Tables

- Headers remain visible during vertical scroll.
- Numerical values align right and use tabular figures.
- Staff/location labels align left.
- Sorting state is visible in both icon and accessible label.
- Row action menus do not hide the primary task.
- Responsive tables become ranked lists only when column comparison is no longer the main task.

### 10.10 Empty states

Empty states provide the next valid action:

- `No open shifts this week. Check another week or location.`
- `No staff match every requirement. Review blocked candidates.`
- `No availability exceptions yet. Add a date when your usual hours change.`

Avoid celebratory illustration on operational empty states.

### 10.11 Skeletons and loading

Skeletons reflect the final structure of the schedule or list. Never replace a full schedule board with a centered spinner. Revalidation preserves visible data and marks it `Updating…` until the fresh result arrives.

---

## 11. Critical Workflow Specifications

### 11.1 Sunday Night Chaos — emergency coverage

The fastest visual path is:

```text
Service Rail `1 open` → Shift inspector → Find coverage
→ Ranked eligible staff → Offer or assign → Committed confirmation
```

Design requirements:

- The open shift receives a danger outline, `1 open`, and time-to-start.
- The rail promotes it above less urgent warnings.
- The inspector opens with `Find coverage` as the primary action.
- Candidate rows show qualification, availability, rest, and projected hours without an extra click.
- If no one is fully eligible, blocked candidates remain inspectable and the UI says why.
- The completed state names the person notified and whether assignment is final or awaiting acceptance.

### 11.2 Overtime Trap — projected labor impact

Before confirmation, show a compact before/after ledger:

```text
Weekly hours          34h → 46h   +12h
Overtime               0h →  6h    +6h
Projected cost       $840 → $1,020 +$180
Consecutive days         5 → 6
```

- Amber highlights a soft threshold; coral highlights a hard block.
- The exact assignment causing a crossing is linked.
- Warnings do not visually resemble successful completion.
- Override actions state the consequence: `Assign with documented override`.

### 11.3 Timezone Tangle

- Cross-location personal schedules show timezone on every item.
- Availability editor states its defining timezone above the weekly grid.
- Converted comparison is disclosed in candidate details: `9:00 AM PT availability begins at 12:00 PM ET`.
- DST ambiguity messages use full IANA zone names when abbreviations are insufficient.
- Overnight shifts display the next-day marker `+1`.

### 11.4 Simultaneous assignment

When realtime data invalidates an open decision:

1. the candidate row changes to `No longer available`;
2. a one-time blue outline marks what changed;
3. an inline message states `Assigned at Harbor West by another manager at 6:14 PM`;
4. the primary action changes to `Recalculate candidates`;
5. the user's other unsaved choices remain visible.

Do not silently remove the person from the list; the manager needs to understand why the option disappeared.

### 11.5 Fairness complaint

The fairness view begins with evidence, not a gauge:

- actual premium shifts;
- eligible premium opportunities;
- expected share;
- desired versus scheduled hours;
- comparison period and location scope;
- shift-level history.

Use a horizontal distribution plot or table before any composite score. A staff row expands to the exact Friday/Saturday shifts counted. Avoid red/green judgmental coloring for people; use neutral comparison with amber only for investigation-worthy imbalance.

### 11.6 Regret swap

The status timeline explicitly preserves responsibility:

```text
Requested by A → Accepted by B → Waiting for manager

Maria remains assigned until manager approval.
[Cancel request]
```

- Current ownership appears above the workflow timeline.
- `Cancel request` names the effect in its confirmation: `Cancel request; Maria keeps the shift`.
- After approval, the old cancellation control disappears and the UI offers `Request another change`.

---

## 12. Role-Specific Experience

### 12.1 Manager

Manager screens optimize for comparison and action:

- schedule board is the default home;
- Service Rail shows urgent coverage and approvals;
- drawers preserve context;
- compact density is available;
- explanations prioritize consequence and alternatives;
- publication status remains visible at the week level.

### 12.2 Staff

Staff screens optimize for certainty and ownership:

- next shift is the first item;
- location and timezone are explicit;
- `You remain assigned` persists during pending swap/drop requests;
- availability uses simple recurring blocks plus exceptions;
- touch targets and plain-language state dominate over analytics;
- notification actions deep-link directly to the affected shift or request.

### 12.3 Admin

Admin screens optimize for scope and evidence:

- location scope is always visible;
- analytics state the reporting period and data freshness;
- fairness and overtime views expose underlying assignments;
- audit views use dense, filterable tables and monospaced before/after values;
- exports state applied location/date filters before download.

---

## 13. Data Visualization

Visualization serves decisions and should remain subordinate to the schedule itself.

### 13.1 Overtime

- Use horizontal stacked bars for regular versus overtime hours.
- Mark 35h warning and 40h overtime thresholds with labeled rules.
- Provide exact values alongside the bar.
- Link the segment crossing 40h to contributing assignments.

### 13.2 Fairness

- Use a dot plot for expected versus actual premium allocation.
- Use a table when precise shift counts are more important than shape.
- Do not use pie charts for comparing staff.
- Do not use a single radial fairness score as the only evidence.

### 13.3 Coverage

- Use `filled / required` ratios and a small linear bar.
- Coral appears only when required headcount is unmet.
- Fully covered states remain quiet rather than bright green.

### 13.4 On duty

- Group by location.
- Show clock-in time, scheduled range, role, and variance.
- Use a small live dot plus `Updated 12 sec ago`; do not rely on an animated dot alone.

---

## 14. Motion and Realtime Feedback

Motion communicates state change; it does not decorate the application.

| Interaction | Duration | Behavior |
|---|---:|---|
| Hover/focus color | `100ms` | Ease out |
| Drawer open | `180ms` | Translate from right + fade |
| Mobile sheet | `220ms` | Translate from bottom |
| Realtime changed item | `160ms` entry | One reveal, then 2s static outline |
| Toast | `160ms` | Fade/translate 4px |
| Schedule drag preview | Direct manipulation | No spring/bounce |

- Avoid ambient gradients, looping pulses, bouncing icons, and staggered list reveals.
- Respect `prefers-reduced-motion`; replace translation with immediate state and persistent outline.
- Realtime changes retain a human-readable timestamp after motion ends.
- Optimistic states say `Saving…`; authoritative completion says `Assigned`, `Published`, or `Cancelled` using the same verb as the action.

---

## 15. Iconography and Imagery

### 15.1 Icons

- Use Lucide icons at 16px or 20px with consistent 1.75–2px stroke.
- Pair unfamiliar or consequential icons with text.
- Reserve filled icons for selected navigation and strong status.
- Use recognizable operational symbols: clock, calendar, users, map pin, shield-check, triangle-alert, circle-stop, refresh, history.
- Do not use a ship wheel, anchor, wave, chef hat, or cutlery as decorative branding in the application shell.

### 15.2 Logo

The ShiftSync wordmark may use Barlow Condensed 600 with a simple two-line rail mark. The logo remains quiet at 24–28px high and never competes with operational context.

### 15.3 Photography and illustration

Core authenticated product screens use no decorative photography. If an illustration is used for onboarding, it should show the logic of multiple locations and overlapping shifts rather than generic smiling restaurant staff.

---

## 16. Content and Voice

### 16.1 Voice

The interface is calm, plain, specific, and accountable. It does not joke during coverage failures or apologize for enforced rules.

### 16.2 Vocabulary

Use these terms consistently:

| Use | Avoid |
|---|---|
| Shift | Event, booking |
| Staff member / staff | Resource |
| Find coverage | Resolve, remediate |
| Assign staff | Allocate user |
| Publish schedule | Push, deploy |
| Request swap | Initiate exchange |
| Drop shift | Release object |
| Waiting for manager approval | Processing |
| No longer available | Invalid candidate |
| Projected hours | Utilization |

### 16.3 Action/result consistency

- `Publish schedule` → `Schedule published`
- `Request swap` → `Swap requested`
- `Cancel request` → `Request cancelled`
- `Assign Maria` → `Maria assigned`
- `Clock in` → `Clocked in at 5:54 PM`

### 16.4 Error pattern

```text
[Outcome]
[Rule or cause]
[Actual value compared with requirement]
[Recovery action or alternative]
```

Example: `Maria cannot be assigned. This would leave 8 hours of rest; 10 hours are required. Choose John, choose Alex, or change the shift time.`

---

## 17. Accessibility

ShiftSync targets WCAG 2.2 AA.

### 17.1 Required standards

- Normal text contrast: at least 4.5:1.
- Large text and meaningful UI graphics: at least 3:1.
- Keyboard focus: visible 2px Sea Glass ring with 2px white offset.
- Touch target: at least 44×44px for primary mobile interactions.
- Color-independent state: icon, text, border/pattern, or position accompanies color.
- Zoom: core workflows work at 200% without lost content or two-dimensional page scrolling, except the schedule grid where structured horizontal scrolling is necessary.
- Tables and schedule grids expose correct row/column headers.
- Drawers and modals trap focus, label their purpose, and restore focus on close.
- Live changes use polite announcements; hard transaction failures use assertive announcements.
- Drag-and-drop assignment always has a keyboard/menu alternative.
- Charts provide equivalent tables or accessible summaries.

### 17.2 Schedule keyboard model

- Tab moves between major regions and actionable shift blocks.
- Arrow keys move among cells only after the grid receives focus.
- Enter opens the shift inspector.
- A context action offers `Assign`, `Edit`, `Find coverage`, and `View history`.
- Escape returns focus to the originating shift.

### 17.3 Time and date accessibility

Visual abbreviations may use `Mon, Sep 1 · 5:00–11:00 PM ET`, while accessible labels expand the timezone and overnight date: `Monday September 1, 5 PM Eastern Time through Tuesday September 2, 11 PM Eastern Time` where applicable.

---

## 18. Responsive and Failure States

### 18.1 Offline or realtime disconnected

Show a persistent page banner:

`Live updates paused. You can keep reviewing the schedule, but assignments will be rechecked before saving. [Reconnect]`

Do not imply local data is authoritative. On reconnect, refetch and mark changed items.

### 18.2 Stale decision surface

If a shift, candidate, or request changes while its drawer is open:

- preserve the user's draft;
- show exactly what changed;
- disable final commit;
- offer `Recalculate` or `Review changes`;
- never silently overwrite the draft.

### 18.3 Partial loading

Page-level context and previously loaded schedule remain visible. The changing region uses a structural skeleton or `Updating…` label. Filters do not reset when one request fails.

### 18.4 Long names and localization readiness

- Staff rows allow two lines before truncation.
- Critical names are available in full via focus/tooltip.
- Buttons allow approximately 30% text expansion.
- Timezone and date formatting come from locale-aware utilities, not hand-built string concatenation.

---

## 19. Implementation Tokens

The following CSS variables are the minimum shared foundation. Component-specific tokens should derive from these rather than hard-coding new colors.

```css
:root {
  --font-display: "Barlow Condensed", "Arial Narrow", sans-serif;
  --font-body: "DM Sans", Arial, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, monospace;

  --color-deep-water: #17343d;
  --color-sea-glass: #176c68;
  --color-mist: #f3f7f6;
  --color-stainless: #d9e4e2;
  --color-galley-amber: #a96816;
  --color-signal-coral: #a8443c;

  --surface-canvas: #f3f7f6;
  --surface-default: #ffffff;
  --surface-subtle: #eaf1ef;
  --surface-inset: #e2ece9;

  --text-strong: #17343d;
  --text-default: #334f56;
  --text-muted: #5b7177;
  --text-disabled: #8a9a9e;

  --border-default: #d9e4e2;
  --border-strong: #afc3bf;
  --focus-ring: #176c68;

  --success-fg: #21654d;
  --success-bg: #e5f3ec;
  --info-fg: #285f7a;
  --info-bg: #e6f1f6;
  --warning-fg: #744914;
  --warning-bg: #fff3d9;
  --danger-fg: #82332d;
  --danger-bg: #fbe9e7;
  --premium-fg: #69460f;
  --premium-bg: #f9edce;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;

  --control-compact: 2rem;
  --control-default: 2.5rem;
  --touch-target: 2.75rem;
  --row-compact: 2.5rem;
  --row-comfortable: 3rem;

  --shadow-drawer: -12px 0 30px rgb(23 52 61 / 0.12);
  --shadow-modal: 0 20px 60px rgb(23 52 61 / 0.18);
}
```

### 19.1 Component architecture guidance

Use shadcn/ui primitives for accessibility and behavior, then apply ShiftSync variants through shared components rather than styling primitives ad hoc.

Recommended design-system components:

```text
components/ui/
  button
  input
  select
  dialog
  sheet
  toast
  tooltip
  data-table

components/shift-sync/
  app-shell
  context-header
  service-rail
  schedule-board
  shift-block
  coverage-meter
  candidate-row
  constraint-panel
  impact-ledger
  request-timeline
  timezone-label
  live-status
  status-chip
  empty-state
```

Domain components own the product vocabulary and semantic states. Base UI primitives should not know what an overtime warning or coverage request means.

---

## 20. Quality Checklist

Before a screen is considered complete, verify:

### Context

- Is the active location visible?
- Is the relevant timezone visible?
- Is the reporting/schedule period visible?
- Is draft versus published state unambiguous?

### Decision clarity

- Does the primary action describe its outcome?
- Are hard blockers visually and verbally distinct from warnings?
- Does each warning show actual value and threshold?
- Are alternatives available where the domain can suggest them?

### Realtime and integrity

- Can the screen reveal that its data changed?
- Is a stale action prevented and explained?
- Does optimistic feedback differ from committed truth?
- Can the user recover without losing unrelated work?

### Audience fit

- Can a manager scan it during service?
- Can a staff member understand current responsibility on a phone?
- Can an admin reach the evidence behind a summary?
- Does the design avoid generic dashboard cards where a board, list, or ledger is more truthful?

### Accessibility

- Is every state understandable without color?
- Is keyboard focus visible?
- Is there a non-drag alternative?
- Are touch targets large enough?
- Are live changes announced appropriately?
- Does reduced motion preserve meaning?

---

## 21. Final Direction

Harbor Calm should ship as a **quiet restaurant operations system**, not a coastal-themed SaaS dashboard. Its Sea Glass palette keeps the environment composed; condensed operational headings and monospaced data sharpen the hierarchy; continuous boards and ledgers make comparison fast; and the Service Rail gives ShiftSync a subject-specific identity rooted in the moment restaurant staffing becomes urgent.

The design succeeds when a manager can answer, within seconds:

1. Where is the staffing risk?
2. Why is an assignment safe, risky, or blocked?
3. Who is the best available alternative?
4. What changed while I was looking?
5. What is true now?

