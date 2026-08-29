# Parent Weekly Email — Design

Date: 2026-08-29
Status: Approved (brainstorming session)

## 1. Goal

Email every active student's full report card to their `parentEmail`
once per week, automatically, plus a coach-controlled manual trigger.
Emails drip through a queue to protect the Gmail sender account from
rate limiting and spam flags.

Decisions made during brainstorming:

| Decision | Choice |
| --- | --- |
| Email content | Full report card (same data as the printable athlete card) |
| Provider | Gmail SMTP via nodemailer, in a Convex Node action |
| Recipients | Every active student with a `parentEmail`; no opt-in toggle |
| Pace | Queued drip, batch of 5 per run, 2-minute spacing |
| Schedule | Monday 06:00 Asia/Manila (Sunday 22:05 UTC), right after the existing weekly-report cron |
| Manual control | Coach "Send parent emails now" button on the reports page |

## 2. Existing surface (no changes needed)

- `students.parentEmail` already exists: schema, coach CRUD
  (`convex/students.ts`), edit-student dialog, seed data.
- `convex/crons.ts` already runs `internal.reports.generateWeekly` at
  `"0 22 * * 0"` (Monday 06:00 Manila) and stores a team report keyed by
  `weekStart`.
- The athlete card computation lives in the public `athleteCard` query
  in `convex/reports.ts`.

## 3. Architecture

Chosen approach: native Convex queue with a self-rescheduling Node
action. No new npm dependencies except `nodemailer`.

Rejected alternatives:

- **@convex-dev/workflow** — formal retries, but a new component
  dependency for a once-weekly batch of tens of emails is overkill.
- **Single long-running action** — no resume on failure, no per-email
  status, risks action time limits, and is exactly the blast pattern
  the queue exists to avoid.

### 3.1 Data model

New table `parentEmails`:

```
studentId   v.id("students")
weekStart   v.string()          // ISO Monday of the reported week
toEmail     v.string()          // parentEmail snapshot at enqueue
payloadJson v.string()          // full report card snapshot
status      v.union("pending", "sent", "failed")
attempts    v.number()          // default 0
lastError   v.optional(v.string())
sentAt      v.optional(v.number())
dueAt       v.number()          // earliest next send attempt
createdAt   v.number()
```

Indexes:

- `by_week_and_student` on `("weekStart", "studentId")` with `.unique()`
  — DB-level idempotency: one email per student per week even if the
  cron and the manual trigger both fire.
- `by_status_and_due` on `("status", "dueAt")` — the processor claims
  due pending rows.

No `skipped` status is stored: students without a `parentEmail`
simply get no row. The coach's student list already shows who is
missing a parent email.

### 3.2 Report card reuse

Extract the card computation from the `athleteCard` query in
`convex/reports.ts` into `convex/lib/reportCard.ts`:

```
buildAthleteCard(ctx, student, today) → card payload object
```

The public query and the enqueue mutation both call it — one source of
truth for coach-printed and parent-emailed numbers.

### 3.3 Cron chain

In `convex/crons.ts`:

1. `0 22 * * 0` — existing `weekly-report` (unchanged).
2. `5 22 * * 0` — new `parent-email-enqueue` →
   `internal.parentEmails.enqueueWeekly` (mutation):
   - Compute `weekStart` the same way `generateWeekly` does
     (ISO week start of yesterday in coach timezone).
   - For each student with `status === "active"` and `parentEmail` set,
     guarded by a per-student `try/catch` (errors isolated, pattern of
     `generateWeekly`): build the card snapshot, insert a `pending`
     row with `dueAt = now`, `attempts = 0`.
   - Insertions tolerate the unique index: a row for
     `(weekStart, studentId)` that already exists is skipped, never
     duplicated.
   - Kick the processor: `scheduler.runAfter(0, processBatch)`.

### 3.4 Processor (drip sender)

`internal.parentEmails.processBatch` — internal **action** with
`useNode: true` (nodemailer requires the Node runtime).

Each run:

1. `claimBatch` (mutation): take up to **5** rows with
   `status = "pending"` and `dueAt <= now`, bump their `dueAt` by the
   drip interval (crash-safe: if the action dies, the next run retries
   them; no stuck in-flight state), return the claimed rows.
2. For each claimed row: render and send via nodemailer.
3. `recordResults` (mutation): per row, `sent` + `sentAt`, or
   `lastError` + `attempts + 1`; `attempts < 3` → stays `pending`
   with `dueAt = now + 30 min` backoff; `attempts >= 3` → permanent
   `failed`.
4. **Daily cap**: stop sending after **400** sends in one calendar day
   (UTC day, counted from `sentAt`); pending rows stay due and resume
   the next day. Safety margin under Gmail's ~500/day limit.
5. If any `pending` rows remain, reschedule:
   `scheduler.runAfter(2 minutes, processBatch)`.

Throughput: 5 emails per 2 minutes ≈ 150/hour; a 100-swimmer team
finishes in well under an hour. Duplicate processor kicks (cron +
manual trigger) are harmless — extra runs no-op on an empty queue.

### 3.5 Mailer

`convex/lib/mailer.ts` (Node-only):

- Transport from environment secrets:
  - `SMTP_HOST` (default `smtp.gmail.com`)
  - `SMTP_PORT` (default `465`, implicit TLS)
  - `SMTP_USER` — the Google account address
  - `SMTP_PASS` — Gmail **app password** (requires 2FA on the account)
  - `MAIL_FROM` — e.g. `CoachKen Tracker <coach@example.com>`
- Headers: `Reply-To: SMTP_USER` so parent replies reach the coach.
- Missing secrets → the processor marks rows `failed` with a clear
  `"SMTP not configured"` error instead of throwing blindly.

## 4. Email content

Subject: `Weekly Swim Report — {studentName} (week of {weekStart})`

Body: HTML with a plain-text fallback, inline styles only (email
client compatibility), rendered from the `payloadJson` snapshot by a
pure function `renderReportEmail(payload) → { html, text }` in
`convex/lib/reportEmail.ts`. Sections mirror the printable card:

- Header — student name, age, group, week
- Attendance — attended / total, percentage
- Commitment — percentage of held practices attended
- Training volume — 12-week meter totals, current week highlighted
- Skills — name + progress percentage
- Personal bests — every event: label, best time, date set, result count
- Goals — title, status, progress, target date

Because the payload is snapshotted at enqueue time, emailed numbers
always match the week they report, even if data changes later.

## 5. Manual trigger & coach UI

- `parentEmails.triggerNow` — public mutation guarded by
  `requireCoach` (`lib/access.ts`, same as all coach functions):
  enqueues any missing students for the most recent completed week —
  the same `weekStart` rule as `enqueueWeekly` (ISO week start of
  yesterday in coach timezone), so the button and the cron always
  target the same report — and kicks the processor.
- `parentEmails.weekStatus` — coach-only query returning this week's
  `{ pending, sent, failed }` counts.
- Coach reports page (`app/coach/reports/page.tsx`): a
  **"Send parent emails now"** button and a status strip showing this
  week's counts. No other UI.

## 6. Error handling summary

| Case | Behavior |
| --- | --- |
| Single send fails | `lastError` recorded, retried with 30-min backoff, permanent `failed` after 3 attempts |
| Processor crashes mid-batch | Claimed rows keep bumped `dueAt`; next run retries them |
| Cron + manual trigger overlap | Unique index prevents duplicate rows; extra processor runs no-op |
| Gmail daily limit approached | Processor stops at 400 sends/day, resumes next day |
| One student's card fails to build | Isolated per-student error; others still enqueue |
| SMTP secrets missing | Rows marked `failed` with explicit error |
| Student inactive or no parent email | Not enqueued (no row) |

## 7. Testing

Vitest + convex-test, same patterns as `convex/reports-weekly.test.ts`
and the authz style in existing suites:

- **enqueueWeekly** — inserts rows only for active students with a
  parent email; running twice creates no duplicates.
- **claimBatch** — returns only due pending rows; bumps `dueAt`.
- **recordResults** — sent transition; failed-with-retry keeps status
  pending and sets backoff `dueAt`; third failure becomes permanent
  `failed`.
- **triggerNow** — requires coach; student/anonymous callers rejected.
- **renderReportEmail** — pure function: html and text contain student
  name, attendance percentage, PB labels, goal titles.
- **reportCard extraction** — `athleteCard` query behavior unchanged
  after refactor (existing tests still pass).

## 8. Security

- `triggerNow` and `weekStatus` are the only public functions; both
  require coach role via `lib/access.ts`.
- Queue/processor functions are internal only.
- Parent emails contain student data sent to the address the coach
  recorded — same trust model as the printable card the coach can
  already email by hand.
- SMTP credentials live in Convex secrets, never in code or client.

## 9. Out of scope

- Per-student opt-in/opt-out toggle (coach can clear `parentEmail`).
- Parent portal accounts (roadmap F5).
- Resend or other provider migration.
- Email open/click tracking.
