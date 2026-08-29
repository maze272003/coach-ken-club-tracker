# CoachKen Tracker — Complete Remaining Surface (R1–R4) Design

Date: 2026-08-29
Status: Approved (sections 1–4 approved in brainstorm session)
Owner: CoachKen Tracker
Supersedes: nothing — extends `2026-08-28-coach-features-roadmap-design.md`
(Rev 2), which remains the source of record for shipped M1–M7.

## 1. Purpose

Design the entire remaining roadmap surface — everything the Rev 2
roadmap specified but did not build — as four release trains:

- **R1 Intelligence** (spec-grade, build-ready): M8 attention flags,
  S1 trends & charts, S2 weekly auto-report + athlete report card,
  S3 coach dashboard v2.
- **R2 Engagement** (design-grade): N8 seasons, S4 rankings,
  S5 student dashboard v2, S6 notifications.
- **R3 Coach Operations** (outline-grade, refined at build time):
  N1 meets, N3 test sets, N4 injury log, N5 announcements, N6 dryland,
  N7 skill assessment history, N9 attendance context, N10 group goals.
- **R4 Platform** (outline-grade with default decisions): N2 parent
  emails, F1 taper planner, F2 ACWR warnings, F3 video analysis,
  F4 multi-coach roles, F5 parent portal.

Each release ships independently usable value. Each non-R1 release gets
its own refinement brainstorm when its turn comes; this document fixes
the boundaries, data models, and rules so those sessions start from
decisions, not blank pages.

## 2. Current State (verified 2026-08-29)

Shipped per git history and code review:

- M1 Groups, M2 Profiles, M3 Practices (planning + `complete` fan-out
  + commitment %), M4 Bulk roll call, dashboard "today" strip.
- M5 Times/PBs (CRUD, PB detection, bulk time trials, CSV export),
  M6 Measurable Goals v2 (derived progress, auto-completion),
  M7 distance/intensity on sessions.
- Coach dashboard layout + data overview module
  (`coachOverview`, `studentDashboard`, `dataOverview.ts`).

Not present anywhere in `convex/`: `insights.ts`, `crons.ts`, reports,
notifications, seasons, rankings, any chart library.

Known debt this design fixes along the way:

- `coachOverview` scans up to 10,000 `trainingSessions` rows
  (`dashboard.ts`) for a single count — replaced in S3.
- `strokeSkills` overwrites itself (destroys assessment history) —
  fixed by N7 in R3.

## 3. Timezone Foundation (applies to every release)

Convex functions run in UTC; the coach operates in **Asia/Manila
(UTC+8, no DST)**.

New `convex/lib/time.ts`:

- `COACH_TZ = "Asia/Manila"` — single source constant.
- `todayInCoachTz(): string` — YYYY-MM-DD via `Intl.DateTimeFormat`
  with `timeZone: COACH_TZ`.
- `weekStartIso(date?): string` — Monday of that date's week.
- `monthKey(date?): string` — YYYY-MM.
- `datePlusDays(date, n): string` — calendar math on YYYY-MM-DD.
- `utcCronFor(hourAsiaManila, minute)` — converts a coach-local time
  to the UTC cron spec string (documented: UTC+8 fixed offset).

All R1–R4 date logic ("today", week/month boundaries, deadlines,
inactivity windows) goes through these helpers — never raw
`Date.now()` / server-local interpretation of date strings.

## 4. R1 — Intelligence (spec-grade)

### 4.1 M8 Attention Flags

**New `convex/lib/flags.ts`** — rule constants and pure evaluators,
shared by the on-demand query (R1), the weekly report cron (S2), and
notification materialization (R3→S6 in R2):

| Constant | Value |
| --- | --- |
| `CONSECUTIVE_MISS_MIN` | 2 |
| `ATTENDANCE_DROP_POINTS` | 15 |
| `ATTENDANCE_DROP_MIN_RECORDS` | 3 |
| `PLATEAU_MIN_RESULTS` | 3 |
| `PLATEAU_WEEKS` | 8 |
| `GOAL_DEADLINE_DAYS` | 14 |
| `INACTIVE_DAYS` | 21 |

**New `convex/insights.ts`** — `coachAttentionFlags` (coach-only
query, computed on demand, nothing stored). Returns
`[{ studentId, studentName, kind, detail, severity }]` sorted by
severity (high → low), then name. Rules:

1. `consecutive_misses` — the swimmer's latest attendance record
   (by date, `by_student_and_date` desc) is `absent` **and** at least
   `CONSECUTIVE_MISS_MIN` records ending at the latest are
   consecutively `absent` (by date order, gaps ignored). High.
2. `attendance_drop` — this calendar month's attendance % is
   `≥ ATTENDANCE_DROP_POINTS` points below last month's, with
   `≥ ATTENDANCE_DROP_MIN_RECORDS` records this month. Medium.
3. `plateau` — any event (stroke/distance/course) with
   `≥ PLATEAU_MIN_RESULTS` results whose current PB is older than
   `PLATEAU_WEEKS`. One flag per swimmer — the worst (oldest PB)
   event, event named in `detail`. Low.
4. `goal_deadline` — non-completed goal with `targetDate` within
   `GOAL_DEADLINE_DAYS` days of `todayInCoachTz()`. Medium.
5. `inactive` — active student with no training session in
   `INACTIVE_DAYS` days, only if the student record itself is
   `≥ INACTIVE_DAYS` days old (uses `joinedAt` when present, else
   `_creationTime`). Medium.

**Performance contract:** every evaluator uses indexed, bounded
reads — attendance: `by_student_and_date` order desc take 30;
plateau: `by_student_and_event` per event take 50; goals:
`by_student_and_updated` take 50; inactivity: range query
`by_student_and_date` with `date > today − 21`. No whole-table
takes anywhere. Coach scale assumption: ≤500 students (matches
existing `take(500)` convention).

**UI:** "Needs Attention" card on the coach dashboard — grouped by
swimmer, severity-styled, each flag deep-links to that swimmer's
page. Empty state: "Nobody needs attention right now."

### 4.2 S1 Trends & Charts

Add **recharts** (React 19 compatible) — first chart library in the
app. Aggregate queries in `insights.ts`, returning ready-to-render
arrays (label + value pairs), no chart logic server-side:

- `studentTrends({ studentId })` (coach) and `myTrends()` (student):
  - `attendanceByMonth`: last 6 `monthKey`s → % attended.
  - `volumeByWeek`: last 12 `weekStartIso`s → sum of
    `trainingSessions.distanceMeters` (weeks with no distance data
    are `null`, rendered as gaps — never zero).
  - `skillRadar`: current `strokeSkills` progress per active skill.
  - `pbProgression`: per event with ≥2 results, the time series of
    `timeMs` (chart picks the event via dropdown).
- `teamTrends()` (coach): attendance % by month, volume by group
  (last 8 weeks).

UI placement (minimal, no page restructures in R1): coach student
detail gains a **Trends** tab (attendance bar, volume line, skill
radar, PB progression); the existing student attendance/training
pages embed the student's own charts; the coach **Groups** page shows
the team volume chart.

### 4.3 S2 Weekly Auto-Report + Athlete Report Card

**New `reports` table:**

```
reports: { weekStart: string (Monday, YYYY-MM-DD),
           payloadJson: string,
           createdAt: number }
  .index("by_week_start", ["weekStart"])
```

**New `convex/crons.ts`** — the app's first cron. Schedule: weekly at
Monday 06:00 Asia/Manila = **Sunday 22:00 UTC** (`"0 22 * * 0"`).
Runs an internal action that computes, per group and team-wide, for
the ISO week just ended:

- practices held (completed count), attendance % (records-based),
  total volume meters (fan-out sessions), PBs achieved (new
  best-per-event count), flags raised (reuses `lib/flags.ts`
  evaluators with the week's data).

Writes one `reports` doc per week. **Idempotent:** keyed by
`weekStart`; re-running replaces the same week's doc (delete + insert
in one transaction). Per-group computation failures are caught,
logged, and recorded as an `errors` entry in the payload — one bad
group never aborts the report.

**UI:** `/coach/reports` — latest report card on top, history list,
browser-print stylesheet (`@media print`). Coach dashboard shows a
compact "Last week" summary strip that deep-links to the page.

**Athlete report card:** `reports.athleteCard({ studentId })` —
coach-only query computed on demand (not stored): header (name, age,
group, join date, season context when R2 lands), attendance +
commitment %, 12-week volume trend (mini table), skill levels, PB
list with dates, goal statuses. Rendered on a print-ready page
(`/coach/students/[id]/report`) linked from student detail.

### 4.4 S3 Coach Dashboard v2

Restructure `app/coach/dashboard` top-to-bottom:

1. **Today strip** (shipped) — stays as is.
2. **Needs Attention** card (M8) — the daily action list.
3. **KPI row with trend arrows:** attendance % Δ vs last month,
   weekly volume Δ vs prior week, PBs this month, active swimmers.
4. **Side column:** upcoming goal deadlines (next 14 days) + next
   practices (next 7 days).
5. **Recent activity feed** — moves to the bottom.

`coachOverview` is replaced by a v2 query whose KPI reads are
**date-bounded indexed range scans** (last 8 weeks via `by_date`
ranges on attendance / trainingSessions / timeResults) — the
10,000-row full take is deleted.

### 4.5 R1 Testing

- `lib/time.ts`: week/month boundaries across UTC+8 midnights.
- `lib/flags.ts`: each rule at its exact threshold (2 vs 3 absences;
  week 7 vs 8 plateau; day 14/15 deadline; day 20/21 inactivity;
  14-point vs 15-point drop).
- Aggregates: week boundaries, missing-distance weeks → null, empty
  states (no records, no skills → "no data" not 0%).
- Report cron: idempotency (re-run replaces), per-group error
  isolation.
- Athlete card: field coverage vs fixture data.

## 5. R2 — Engagement (design-grade)

### 5.1 N8 Seasons

**`seasons` table:** `{ name (1–80, unique among active), startDate,
endDate (YYYY-MM-DD, end ≥ start), status: "active" | "archived",
updatedAt }`, index `by_status`. Exactly one active season — creating
a new one archives the previous (validated in the mutation). Coach
CRUD; UI lives on the coach Data page (no new nav entry). Every
season-scoped query resolves the window: active season if present,
else the current calendar year (fallback documented in code).

### 5.2 S4 Rankings

`rankings.seasonBests({ groupFilter?, ageGroupFilter? })`: per event
(stroke, distance, course), the best `timeMs` within the resolved
season window (via `by_event` + `by_student_and_event` indexes),
ranked ascending. Age groups derived from `dateOfBirth` (standard
bands: 10&U, 11–12, 13–14, 15–17, 18+; constant list). Opt-out:
`students.leaderboardOptOut: boolean` (default false, coach-editable
on profile). Opted-out swimmers render as "—" in coach views and are
**excluded** from student-facing boards. No stored ranks — always
derived. UI: `/coach/rankings` (full board) + student "Team bests"
read-only view (opt-outs respected).

### 5.3 S5 Student Dashboard v2

Restructure `app/student/dashboard`: PB table with per-event history
links, attendance % vs team average (team average computed
anonymously — no other swimmers' names), weekly volume chart
(S1 `myTrends`), goal list with derived-progress countdowns, Team
bests per S4 rules. All data via `requireStudent`-scoped queries;
`medicalNotes` never appears.

### 5.4 S6 Notifications

**`notifications` table:** `{ userId: Id<"users">, kind, payloadJson
(dedupKey inside), readAt?: number, createdAt: number }`, index
`by_user_and_read ["userId", "readAt"]`. Daily cron at 03:00
Asia/Manila = **19:00 UTC** (`"0 19 * * *"`) materializes: M8 flags
→ coach notifications; day-before practice reminders (coach);
goal-deadline reminders at 7 days and 1 day (coach + student).
**Dedup rule:** before inserting, check the last 7 days of the same
`kind` + `dedupKey` for that user; skip if present. The on-demand M8
query stays — the cron only persists. Queries: `myNotifications`,
`markRead`, `markAllRead` (self-scoped). UI: bell icon + unread
badge in coach and student layouts; dropdown list; mark-all action.

### 5.5 R2 Testing

Season fallback/overlap rejection; ranking derivation with opt-outs
and age bands; notification dedup (same flag not re-notified);
student dashboard scoping (wrong user refused).

## 6. R3 — Coach Operations (outline-grade)

Each module below is refined into its own spec section at build
time ("spec at build time" convention from the roadmap):

- **N7 Skill assessment history** — append-only `skillAssessments`
  table (`studentId`, `skillKey`, `level` (0–100), `date`, `note?`;
  index `(studentId, skillKey, date)`). `strokeSkills` remains as
  the derived current-level cache written in the same transaction.
  Unlocks skill-trend charts and assessment audit trails.
- **N1 Meet calendar & entries** — `meets` (name, date, location?,
  seasonId?) + `meetEntries` (meetId, studentId, event, timeMs?).
  Recorded meet results insert into `timeResults` with
  `context: "meet"` (single source of truth for PBs).
- **N3 Test sets & benchmarks** — `testTemplates` (title, sets
  JSON) + `testResults` (templateId, studentId, date, result JSON);
  benchmark thresholds feed a future `flags.ts` rule.
- **N4 Injury/illness log** — `injuryLog` (studentId, kind,
  fromDate, toDate?, notes?). Open injury windows suppress the
  `inactive` flag for that swimmer (change inside `lib/flags.ts`).
- **N5 Announcements** — `announcements` (groupId, title, body,
  createdAt); student dashboard shows their group's latest 3.
- **N6 Dryland/strength log** — `drylandSessions` (studentId, date,
  minutes, type, load?) — separate from `trainingSessions` so
  strength volume never pollutes water meters; own weekly totals in
  trends.
- **N9 Attendance context** — optional `reason?` (≤200 chars) +
  `excused: boolean` (default false) on `attendance`; optional
  `practiceId` link. Commitment denominators become practice-exact
  instead of date-inferred (upgrade inside `lib/stats.ts`).
- **N10 Group-scoped goals** — `scope: "individual" | "group"` +
  `groupId?` on `trainingGoals`; same derived-progress engine,
  fan-out display for group members.

R3 modules are independent of each other and can be interleaved by
coaching need; only N9 touches existing derived stats.

## 7. R4 — Platform (outline-grade, defaults chosen)

- **N2 Parent emails** — weekly digest to `parentEmail` addresses.
  *Open decision (default):* provider = **Resend** (free tier,
  simple HTTP API). Requires domain verification at build time.
- **F2 ACWR workload warnings** — acute (7-day) ÷ chronic (28-day
  rolling average) volume ratio; ratio > 1.5 or < 0.8 raises a new
  `load_spike` / `load_stall` flag in `lib/flags.ts`. Needs ≥4 weeks
  of distance data before evaluating.
- **F1 Taper planner** — planned volume-reduction curve (percentage
  per week) against a target meet date; compares planned vs actual.
- **F3 Video analysis** — timestamped annotations on uploaded clips.
  *Open decision (default):* storage = **Convex file storage**.
- **F4 Multi-coach roles** — expand `users.role` with `assistant`,
  `viewer`; per-function permission checks in `lib/access.ts`.
- **F5 Parent portal** — read-only parent accounts linked to their
  swimmer; scoped queries only (attendance, reports, PBs).

R4 starts only after R1–R3 land and real demand confirms priority.

## 8. Cross-Cutting Concerns

**Security** — unchanged model via `lib/access.ts`: all R1–R4
queries/mutations enforce `requireCoach` / `requireStudent`
server-side; crons and internal actions are `internal*` functions
not callable from clients; no student-facing query exposes
`medicalNotes` or other swimmers' identities (team average is
aggregate-only); notification reads are self-scoped by `userId`.

**Validation** — `lib/validation.ts` patterns: trimmed length caps,
`assertDateString`, `assertTimeMs` reuse; new `assertSeasonRange`
(start < end). All errors are `ConvexError` with user-readable
messages, matching existing style.

**Migration** — all new fields optional (`leaderboardOptOut`,
`excused`, `reason`, `scope`), all new tables additive. No
destructive change; no backfill required in R1. R2 adds no backfill
(fallbacks cover absence of seasons).

**Performance** — every new table indexed for its access paths
(listed per section); flags/trends/KPI reads are bounded indexed
scans (≤500 students, ≤30/50-row per-student windows, date-ranged
KPIs); `coachOverview`'s 10,000-row take is deleted in S3.

**Error handling** — cron actions catch per-group/per-student
failures and record them in the report payload without aborting;
notification cron dedups by `kind` + `dedupKey` over a 7-day window;
all mutations validate before write.

**Testing** — vitest + convex-test, extending the existing suite
(`*.test.ts` beside modules). Gates: `npm run typecheck`,
`npm run lint`, `npm test`. Seed data (`seed.ts`) is extended per
release to cover the new surfaces (R1: enough history to trigger
every flag and 12 weeks of volume; R2: a season + opt-out swimmer).

## 9. Build Order & Dependencies

```
R1:  lib/time.ts → lib/flags.ts + M8 → S1 charts → S2 reports/cron → S3 dashboard v2
R2:  N8 seasons → S4 rankings → S5 student v2 → S6 notifications
R3:  any order (N9 last among stats-touching items; N4 pairs with flags v2)
R4:  after R1–R3, demand-driven
```

Hard dependencies: S2's cron reuses `lib/flags.ts`; S6 reuses M8
rules + dedup; S4 needs N8; S5 embeds S1's `myTrends` and S4's Team
bests. R1 is fully build-ready and gets the first implementation
plan; R2–R4 each get a refinement pass before their plans.

## 10. Out of Scope (all releases)

SMS delivery; native mobile apps; billing; third-party meet-result
import formats; public marketing site. Deferred indefinitely.

## 11. Revision History

**Rev 1 — 2026-08-29** Initial approved design from the full-surface
brainstorm session: R1 spec-grade (M8, S1, S2, S3 with timezone
foundation), R2 design-grade (N8, S4, S5, S6), R3/R4 outline-grade
with default decisions, build order fixed.
