# CoachKen Tracker

A focused **swimmer training & progress tracking app** for one coach and
their swimmers.

- The **coach** manages student accounts and records attendance, training
  sessions, stroke skill progress, and training goals.
- Training **groups** organize the team; the coach schedules **group
  practices** and completes them in one click — a training session is
  logged automatically for every swimmer who attended.
- Roll call is a **single bulk save** per group per day.
- **Swimmer profiles** carry age, group, parent contact, and coach-only
  medical notes.
- **Students** sign in and see their own progress dashboard.

Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, and
Convex (backend + database + [Convex Auth](https://labs.convex.dev/auth)).

## Getting started

```bash
npm install
npx convex dev
```

`npx convex dev` starts both the Convex backend and `next dev`.

### Environment variables

Copy `.env.example` and set the coach credentials (server-side only —
they are never exposed to the browser):

```env
COACH_EMAIL=coach@example.com
COACH_PASSWORD=change-this-password
COACH_NAME=Coach Ken   # optional display name
```

Set them on your Convex deployment:

```bash
npx convex env set COACH_EMAIL=coach@example.com
npx convex env set COACH_PASSWORD=change-this-password
```

Convex Auth also requires `JWT_PRIVATE_KEY` and `JWKS` deployment
variables (see the [Convex Auth setup docs](https://labs.convex.dev/auth/setup/manual)).

### Demo data

With an empty database, seed four demo swimmers with attendance,
sessions (distance + intensity), skills, times (incl. IM), goals
(all statuses), parent contact info, and medical notes:

```bash
npx convex run seed:seed            # seed demo data
npx convex run seed:resetDemo       # remove only the demo accounts/groups
npx convex run seed:status          # table counts + demo account report
```

The coach **Data** page (`/coach/data`) shows the same counts plus a
per-swimmer data-coverage matrix for verifying seeds and migrations.

Demo credentials (dev only):

| Account | Email | Password |
| --- | --- | --- |
| Coach | your `COACH_EMAIL` | your `COACH_PASSWORD` |
| Student | `alex.santos@demo.swim` | `swim-demo-2026` |
| Student | `maria.reyes@demo.swim` | `swim-demo-2026` |
| Student | `daniel.cruz@demo.swim` | `swim-demo-2026` |
| Student | `lily.wu@demo.swim` | `swim-demo-2026` |

## Architecture

```
convex/
  schema.ts        users, groups, skills, students, attendance, practices,
                   trainingSessions, strokeSkills, timeResults, trainingGoals,
                   reports (+ auth tables)
  auth.ts          single "password" provider:
                   - coach validates against COACH_EMAIL/COACH_PASSWORD env vars
                   - students validate against scrypt-hashed passwords
  students.ts      account/profile management (coach-only writes)
  attendance.ts    roll call (single + bulk) + per-student history/stats
  training.ts      training sessions (duration, distance, intensity)
  skills.ts        stroke skill progress (record-based, extensible strokes)
  goals.ts         training goals (manual, measurable time/attendance)
  groups.ts        training groups with member counts
  practices.ts     group practice planning + one-click completion fan-out
  dashboard.ts     coach overview v2 (KPIs, deltas) + student dashboard aggregates
  insights.ts      attention flags (M8) and trends aggregate queries (S1)
  reports.ts       athlete report cards & weekly team reports (S2)
  crons.ts         weekly report automated cron (Monday 06:00 Asia/Manila)
  times.ts         swim times (PBs, bulk time trials, CSV export)
  dataOverview.ts  coach-only per-student data coverage matrix
  seed.ts          demo data + seed:status verification report
  lib/             access control, validation, stats, time, flags, kpis

app/
  login/                      sign-in page (no public registration)
  coach/                      dashboard, students, groups, practices,
                              times, reports, attendance, training, skills,
                              goals, data (seed overview), profile
  student/                    dashboard, attendance, training, skills,
                              times, goals, profile
```

### Security model

- All authorization is enforced in Convex functions — never client-side.
- Students never pass a student id: identity is resolved from the
  authenticated session server-side.
- Coach-only functions verify `role === "coach"`; student functions
  resolve the caller's own student record and reject everything else.
- Student passwords are stored as scrypt hashes; the coach can reset
  (but never read) them.
- Coach credentials live only in server-side environment variables.

### Domain rules

- **Attendance**: `present` and `late` count as attended, `absent` does
  not. The percentage is always derived from the records.
- **Practices**: completing a practice logs a training session for every
  active group member who was not marked absent that day; re-completing
  updates those sessions.
- **Commitment**: attendance ÷ completed group practices since the
  swimmer's join date, shown alongside the legacy all-records attendance
  percentage.
- **Overall training progress** is the average of the student's stroke
  skill progress; with no skill records the app shows
  "no progress recorded yet" instead of `0%`.
- **Goals** that reach 100% progress are automatically marked completed.

### Tests

Convex function tests run with vitest + convex-test:

```bash
npm test
```
