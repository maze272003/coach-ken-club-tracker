# CoachKen Tracker — Coach Features Roadmap (Design)

Date: 2026-08-28
Revision: 2 (2026-08-28 — professional coaching gap-analysis review)
Status: Approved
Owner: CoachKen Tracker

## 1. Purpose

Turn the tracker from a manual record book into a coach's decision system.
Three goals, in order:

1. **Eliminate daily data-entry tax** — group practices, bulk roll call.
2. **Make progress measurable** — times/PBs, distance/intensity, measurable goals.
3. **Generate insight automatically** — attention flags, trends, weekly reports.

## 2. Current State

Tables: `users` (coach/student roles), `skills` (catalog), `groups`,
`students` (with profile fields: dateOfBirth, sex, parent contact,
joinedAt, medicalNotes, groupId), `attendance` (per student/date),
`practices` (planned/completed/cancelled group sessions),
`trainingSessions` (per student: date, durationMinutes,
distanceMeters, intensity, strokes[], practiceId, notes),
`strokeSkills` (progress %), `trainingGoals` (manual progress %,
free-text target).

**Implementation status (Rev 2):** M1 Groups and M2 Profiles are
shipped. M3 planning (`create/update/cancel/list*`) is shipped; the
`complete` fan-out mutation and `commitmentStats` helper landed in the
working tree during this review (uncommitted at Rev 2 commit time,
alongside the staged red test `convex/practices-complete.test.ts`).
M4 `recordBulk` is not started. M5–S6 and the P2/P3 items remain
design-only.

Confirmed remaining gaps: no practice completion fan-out or bulk roll
call (sessions are still logged one swimmer at a time), no race times
or PBs, no trends/charts, no computed insights, no reports, no
notifications. Goal progress is manual and attendance % only counts
recorded days — a swimmer who stops showing up without records being
taken looks unchanged. `strokeSkills` stores a single mutable number
per stroke, so each update destroys assessment history.

## 3. Coach Workflow Requirements

- **Before practice:** see today's scheduled practices per group; roll-call
  sheet pre-filled with the attending group.
- **During/after practice:** one bulk roll-call action; one "mark completed"
  action that logs sessions for every attendee automatically.
- **Weekly:** auto-generated summary (sessions held, attendance, volume, PBs,
  flags) without the coach computing anything.
- **Always:** a "who needs attention" list that replaces manual scanning.

## 4. Features

Priorities: P0 = must have, P1 = should have, P2 = nice to have,
P3 = future.

### M1. Training Groups — P0 (shipped)

**Why:** every team-level feature (roll call, planning, rankings) needs a
group dimension. Built first; blocks M2–M4, M8, S2–S4.

**Data model**

- New `groups` table: `name` (1–80 chars, unique among active), `description`
  (optional, ≤500 chars), `status: "active" | "archived"`, `updatedAt`.
  Indexes: `by_status`.
- `students.groupId`: optional `v.id("groups")`. Missing = "Unassigned".
- Groups are archived, never deleted (history must stay linkable). Archiving
  does not clear membership; the group is hidden from planning UI and its
  members appear under "Unassigned" in filters.

**Functions** (`convex/groups.ts`): `list` (coach; with member counts),
`create`, `rename` (name/description), `setStatus` (archive/reactivate),
`assignStudent` (coach; sets/clears `students.groupId`). All coach-only
mutations. Students resolve their own group name through existing
student-access queries.

**UI:** new `app/coach/groups` page (list, create, rename, archive, member
count). Group filter tabs on coach students/attendance/training pages.
Group shown in student detail header.

### M2. Swimmer Profiles — P0 (shipped)

**Why:** age-appropriate training, safe contact of minors, and season
context all require real athlete attributes.

**Data model** — add to `students` (all optional): `dateOfBirth`
(YYYY-MM-DD), `sex` ("M" | "F"), `parentName`, `parentPhone`, `parentEmail`,
`joinedAt` (YYYY-MM-DD), `medicalNotes` (≤2000 chars).

**Rules**

- Age is always derived from `dateOfBirth` (helper in `lib/stats.ts`);
  never stored.
- `medicalNotes` is coach-only: excluded from every student-facing query
  (students cannot read their own medical notes in v1).
- Validation: DOB in the past and age 3–100; parent email format-checked
  only (no verification in v1).

**Functions:** extend `students.create` / `students.update` args; extend
`students.get` (coach) and `students.myProfile` (student, minus
`medicalNotes`).

**UI:** coach student detail gains a profile header (age, group, sex, join
date, parent contact) and an edit form. Student profile page shows own
profile without medical notes.

### M3. Practice Plans → Completed Sessions — P0 (partial: planning shipped; `complete` fan-out pending)

**Why:** one planned group practice replaces N per-swimmer session entries;
planned vs. actual attendance finally gives attendance % a true denominator.

**Data model**

- New `practices` table: `groupId`, `date` (YYYY-MM-DD), `startTime`
  (optional "HH:MM"), `title` (1–120), `plannedDurationMinutes` (1–600),
  `plannedDistanceMeters` (optional, 0–30000), `strokes` (skill keys,
  validated against catalog), `notes` (workout sets, ≤5000 chars, optional),
  `status: "planned" | "completed" | "cancelled"`, `completedAt` (optional),
  `actualDurationMinutes` (optional), `actualDistanceMeters` (optional),
  `updatedAt`.
  Indexes: `by_group_and_date` (groupId, date), `by_date`, `by_status`.
- `trainingSessions` additions (all optional): `practiceId: v.id("practices")`,
  `distanceMeters` (0–30000), `intensity: "easy" | "moderate" | "hard"`.

**Functions** (`convex/practices.ts`): `create`, `update`, `cancel`,
`complete`, `listForGroup` (date range), `listUpcoming` (all groups, next
14 days), `detail` (practice + fan-out summary).

**Fan-out rule (`complete`)** — idempotent mutation:

1. Sets status `completed`, records `completedAt`, actual duration/distance.
2. For each **active** member of the practice's group: if an attendance
   record exists for (student, date) with status `absent`, skip. If an
   attendance record exists with `present`/`late`, create the session. If no
   attendance record exists, create the session.
3. Session = upsert keyed by (studentId, practiceId): patch if exists, else
   insert with date, title, durationMinutes = actual (fallback planned),
   distanceMeters = actual (fallback planned), strokes, notes prefixed
   "From practice: ", `intensity` left unset (coach can edit).
4. Re-running `complete` with different actuals patches existing fan-out
   sessions.

**Attendance % v2 (commitment %):** existing record-based attendance stats
stay unchanged. New derived stat: attended sessions ÷ group practices with
status `completed` for the swimmer's group since their `joinedAt` (or all,
if no join date). Shown alongside legacy %; does not replace it.

**UI:** `app/coach/practices` page — calendar/list (upcoming + past 30
days), create/edit form (group, date, plan), actions per practice: Mark
Completed (prompt actual duration/distance), Cancel. Coach dashboard shows
today's practices with one-click actions.

### M4. Bulk Roll Call — P0 (pending)

**Why:** attendance is the app's highest-frequency action; it must be one
screen and one save.

**Function:** `attendance.recordBulk` (coach-only): args
`{ date, entries: [{ studentId, status }] }`, max 200 entries, validates
each student exists and is active; reuses the same upsert-per-student
semantics as `attendance.record` (one record per student per date). All
rows write in one transaction.

**UI:** coach attendance page "Roll call" mode: pick group + date
(default: today's scheduled practice), swimmers listed with segmented
Present/Late/Absent buttons, "Mark all present" action, single Save with
toast. After save, if a scheduled practice exists for that group/date,
offer a one-click "Complete practice" shortcut.

### M5. Time Results & Personal Bests — P0

**Why:** times are the currency of swimming; PBs are the strongest
motivator and the basis for measurable goals and rankings.

**Data model**

- New `timeResults` table: `studentId`, `date` (YYYY-MM-DD), `distanceMeters`
  (one of 25, 50, 100, 200, 400, 800, 1500), `stroke` (skill key, validated
  against catalog), `course: "short" | "long"`, `timeMs` (integer > 0),
  `context: "practice" | "time_trial" | "meet"`, `notes` (optional ≤500),
  `updatedAt`.
  Indexes: `by_student_and_event` (studentId, stroke, distanceMeters,
  course), `by_date`.
- **Event** = (stroke, distance, course). No separate events table.

**PB rules**

- PBs are computed from `timeMs` (lower = better) via the
  `by_student_and_event` index; no stored flag (append-only data makes
  derived PBs always correct).
- `timeResults.create` (coach-only) returns
  `{ isNewPersonalBest, previousBestMs | null, deltaMs | null }` so the UI
  can toast "NEW PB −1.8%".
- Time input accepts "mm:ss.cs", "mm:ss.cs0", and "ss.cs" (e.g. "1:02.35",
  "62.35"); parsed to integer ms client-side, validated server-side
  (> 0, < 3600000).

**UI:** coach: record-time form (student, event, course, context, date).
Student detail "Times" tab: PB table per event (best, count, date, weeks
since), full history list with PB highlighting. Student dashboard gets a
"Latest PB" highlight.

### M6. Measurable Goals v2 — P0

**Why:** manual progress % is busywork the system can compute; measurable
goals drive real behavior.

**Data model** — `trainingGoals` additions: `type: "manual" | "time" |
"attendance"` (backfill existing rows to `"manual"` via a one-time
internal mutation, following the existing `skills.backfill` pattern;
queries treat missing `type` as `"manual"`), `distanceMeters` (optional,
event), `stroke` (optional, event), `course` (optional, event),
`targetTimeMs` (optional, > 0), `targetAttendancePct` (optional, 1–100),
`baselineBestMs` (captured at creation from current PB; null if none).

**Progress rules (derived on read)**

- `manual`: stored progress % (current behavior).
- `time`: `100 × (baseline − currentBest) / (baseline − target)`, clamped
  0–100; if no baseline exists, progress stays 0 until a first result is
  recorded, then baseline = that first result. Completed when
  `currentBest ≤ targetTimeMs`.
- `attendance`: attendance-to-date % ÷ target %, clamped
  0–100 (attended ÷ recorded, same derivation as legacy stats). Completed
  when actual % ≥ target.

**Status automation:** no cron. Displayed progress is always derived by
`goals.listForStudent` / `goals.my`. `timeResults.create` and
`attendance.record`/`recordBulk` call an internal helper that patches any
goal that just met its completion threshold to `status: "completed"` (the
existing 100% auto-complete convention extended to computed goals).

**UI:** goal form gains a type selector; time goals pick event + target
time (same parser as M5), attendance goals pick target %. Progress bars
show derived values with a "computed" hint.

### M7. Distance & Intensity on Sessions — P0

**Why:** volume in meters and load perception are how coaches balance
training, not minutes alone.

Covered by M3 schema changes plus: coach manual session create/edit forms
gain optional `distanceMeters` and `intensity` fields (same validation
ranges). Aggregations in `lib/stats.ts`: `weeklyVolumeMeters(ctx,
studentId, sinceMs)` (sum of `distanceMeters` per ISO week) used by M8, S1,
S2.

### M8. Attention Flags (Auto Insights v1) — P0

**Why:** the single highest-value intelligence feature — replaces the
coach's manual "scan everyone" routine with a daily action list.

**Function:** `insights.coachAttentionFlags` (coach-only query, computed on
demand — no cron in v1). Returns
`[{ studentId, studentName, kind, detail, severity }]` sorted by severity.

Rules (thresholds are constants, documented in code):

1. `consecutive_misses` — latest attendance record is `absent` and ≥2
   records leading back from the latest date are consecutively `absent`
   (by date order, ignoring gaps). Severity: high.
2. `attendance_drop` — this calendar month's % is ≥15 points below last
   month's, with ≥3 records this month. Severity: medium.
3. `plateau` — for events with ≥3 results, weeks since PB ≥8. One flag per
   swimmer (worst event). Severity: low.
4. `goal_deadline` — non-completed goal with `targetDate` within 14 days.
   Severity: medium.
5. `inactive` — active student with no training session in 21 days (only
   if student record is ≥21 days old). Severity: medium.

**UI:** "Needs Attention" card on coach dashboard: grouped by swimmer,
each flag links to the swimmer's page. Empty state: "Nobody needs
attention right now."

### S1. Trends & Charts — P1

Per swimmer: monthly attendance % (bar), weekly volume in meters (line),
skill progress radar, PB progression per event (scatter/line). Team:
attendance trend, volume by group. Library: add **recharts** (React 19
compatible) — no chart library exists today. Charts render from new
aggregate queries in `insights.ts` (student and coach variants), following
existing access rules.

### S2. Weekly Auto-Report — P1

Monday 06:00 UTC cron (`crons.ts`) runs an internal action that computes, per
group and team-wide: practices held, attendance %, total volume, PBs
achieved, new flags — and writes a `reports` document
(`reports` table: `weekStart` date, `payloadJson`, `createdAt`; index
`by_week_start`). Coach dashboard shows the latest report; report page
allows print/export (browser print). No email in v1.

**Rev 2 extension — athlete report card:** the same report machinery also
renders a per-swimmer printable card (attendance + commitment %, volume
trend, skill levels, PB list with dates, goal status) for parent meetings
and athlete reviews.

### S3. Coach Dashboard v2 — P1

Restructure `app/coach/dashboard`: (top) today's practices with one-click
roll call / complete; (middle) Needs Attention card (M8); KPI row with
trend arrows (attendance Δ vs. last month, weekly volume Δ vs. prior week,
PBs this month, active swimmers); (side) upcoming goal deadlines and next
practices. Replaces the current stats + activity feed layout; recent
activity feed moves below.

Scope note (Rev 2): the minimal "today's practices with one-click roll
call / complete" strip is P0 and ships with M3/M4 — S3 is the fuller
restructure around it. `coachOverview`'s 10000-row session scan is
replaced by an indexed count here.

### S4. Rankings / Leaderboard — P1

Per event + group, ranked by season best (best `timeMs` in the current
season window; season = configurable date range constant in v1, default
calendar year). Age-group filter (from M2). Per-student opt-out flag
(`students.leaderboardOptOut`, default false) — opted-out swimmers appear
as "—" for the coach but never in student-facing boards.

### S5. Student Dashboard v2 — P1

Own PB table with history, attendance vs. team average, weekly volume
chart, goal countdowns with derived progress. No rankings unless not
opted out (S4 rules). All data through student-access queries.

### S6. Notifications & Reminders — P1

In-app notifications only (no email in v1): `notifications` table
(`userId`, `kind`, `payloadJson`, `readAt`, `createdAt`; index
`by_user_and_read`). Generated by: a daily cron that evaluates the same
M8 rules (the on-demand query stays; the cron materializes
notifications), practice reminders
(day-before, from scheduled practices), goal deadline reminders (7 days /
1 day). Bell icon with unread count in both layouts. Email digests are a
P2 follow-up.

### P2 — Nice to Have (spec at build time)

Season & meet calendar with meet entries/results (N1); parent attendance
emails (N2); standardized test sets with tracked benchmarks (N3);
injury/illness log with return-to-training notes (N4); announcements board
per group (N5); dryland/strength log separate from water volume (N6).

Rev 2 additions from the gap analysis:

- **N7. Skill assessment history** — `strokeSkills` overwrites itself, so
  progress has no trajectory or evidence. New append-only `skillAssessments`
  table (`studentId`, `skillKey`, `level`, `date`, `note`; index
  `(studentId, skillKey, date)`); `strokeSkills` stays as the derived
  current-level cache. Unlocks skill-trend charts and honest "what changed
  and when" reviews.
- **N8. Seasons** — named date ranges (e.g. "2026–27 Short Course") that
  scope season-bests (S4), reports (S2), and rosters. Defaults to calendar
  year until a season is created; needed before rankings mean anything
  across mid-year boundaries.
- **N9. Attendance context** — optional `reason`/excused flag on
  `attendance` (exam vs. skipped are different coaching problems) and
  optional `attendance.practiceId` to tie records to the practice that
  spawned them, making commitment denominators exact instead of
  date-inferred.
- **N10. Group-scoped goals** — `scope` field on goals (individual vs.
  group) so relay/team standards have a home; same derived-progress engine
  as M6.

### P3 — Future / Advanced

Taper planner (F1); acute:chronic workload ratio warnings (F2); video
skill analysis with timestamped annotations (F3); multi-coach roles (F4);
parent portal accounts (F5).

## 5. Cross-Cutting Concerns

**Security** — identical model to today, via `lib/access.ts`: coach-only
writes for groups, practices, time results; students read only their own
data through `requireStudent`/`resolveStudentAccess`; no student-facing
query exposes `medicalNotes`; role checks live in Convex functions, never
client-side.

**Validation** — reuse `lib/validation.ts` patterns (trimmed length caps,
`assertDateString`, new `assertTimeMs`, `assertDistanceMeters`,
`assertIntensity`, event distance enum). All errors are `ConvexError` with
user-readable messages, matching existing style.

**Migration** — all new fields are optional; no destructive change.
One-time backfill: goals `type → "manual"` (skills.backfill pattern).
Existing sessions/goals keep working unchanged.

**Performance** — every new table has indexes matching its access paths
(listed per table). Dashboard flag query reads at most ~500 students ×
bounded per-student scans; volume aggregates use indexed range scans, not
table scans. `coachOverview`'s current 10000-row session scan is replaced
by an indexed count during Phase 3 (dashboard v2).

**Error handling** — mutations validate before write and are idempotent
where retried (fan-out upsert, roll-call upsert). Cron actions catch and
log per-group failures without aborting the whole report.

**Testing** — no test framework exists. Add **vitest + convex-test** for
Convex function tests (auth boundaries, fan-out idempotency, PB math,
goal progress derivation, flag thresholds). Gates: `npm run typecheck`,
`npm run lint`, and the new `npm test`. UI verification: seeded demo data
extended to cover groups, practices, times, and computed goals.

## 6. Build Order & Dependencies

```
Phase 1 (foundation):  M1 Groups → M2 Profiles → M3 Practices → M4 Roll Call
Phase 2 (performance): M5 Times/PBs → M6 Goals v2 → M7 Distance/Intensity
Phase 3 (intelligence): M8 Flags → S1 Charts → S2 Weekly Report → S3 Dashboard v2
Phase 4 (engagement):  S4 Rankings → S5 Student v2 → S6 Notifications
```

**Rev 2 status:** Phase 1 is mid-flight — M1/M2 shipped, M3 planning
shipped, M3 `complete` fan-out + commitment % implemented in the working
tree (pending commit), M4 not started. The immediate next work is
finishing Phase 1 (M4 bulk roll call, dashboard Today strip, then
committing and verifying the M3 fan-out) per the existing plan
(`docs/superpowers/plans/2026-08-28-phase1-groups-profiles-practices-rollcall.md`)
before opening Phase 2.

Hard dependencies: M3 needs M1. M4's practice shortcut needs M3. M6 needs
M5. M8 needs M3/M5/M6 data. S2/S6 need M8 rules. S1 needs M3/M7.
Each phase ships independently usable value; each gets its own
implementation plan, starting with Phase 1.

## 7. Out of Scope (this roadmap)

Email/SMS delivery, video upload, meet results import formats, multi-coach
permissions, billing, mobile-native apps. All deferred to P2/P3 or later
roadmaps.

## 8. Revision History

**Rev 2 — 2026-08-28 (professional coaching gap-analysis review)**

Full-codebase re-review (schema, all Convex modules, UI surface, git
history) confirmed the roadmap direction and produced these changes:

- **Current State rewritten** with implementation status: M1/M2 shipped;
  M3 `complete` fan-out + commitment % landed in the working tree during
  the review (parallel session); M4 `recordBulk` missing.
- **Priority corrections:** commitment % (M3) confirmed P0 — it fixes the
  "silent dropout" flaw where attendance % only counts recorded days. The
  dashboard "today strip" with roll-call/complete shortcuts is P0 scope of
  M3/M4; only the fuller Dashboard v2 restructure is P1 (S3) — this split
  was ambiguous in Rev 1.
- **New P2 items (N7–N10):** skill assessment history (append-only
  `skillAssessments` — `strokeSkills` currently destroys history on every
  update), seasons entity, attendance reasons/excused flag +
  `attendance.practiceId` link, group-scoped goals.
- **S2 extended** with the printable athlete report card (parent-meeting
  ready).
- **Build order annotated** with Phase 1 mid-flight status; next action is
  executing the remaining tasks of the existing Phase 1 plan.

No changes to the security model, migration strategy, or M5–M8/S1/S6
designs — the review validated them as specified.
