# CoachKen Tracker

A focused **swimmer training & progress tracking app** for one coach and
their swimmers.

- The **coach** manages student accounts and records attendance, training
  sessions, stroke skill progress, and training goals.
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

With an empty database, seed three demo swimmers with attendance,
sessions, skills and goals:

```bash
npx convex run seed:seed
```

Demo credentials (dev only):

| Account | Email | Password |
| --- | --- | --- |
| Coach | your `COACH_EMAIL` | your `COACH_PASSWORD` |
| Student | `alex.santos@demo.swim` | `swim-demo-2026` |
| Student | `maria.reyes@demo.swim` | `swim-demo-2026` |
| Student | `daniel.cruz@demo.swim` | `swim-demo-2026` |

## Architecture

```
convex/
  schema.ts        users, students, attendance, trainingSessions,
                   strokeSkills, trainingGoals (+ auth tables)
  auth.ts          single "password" provider:
                   - coach validates against COACH_EMAIL/COACH_PASSWORD env vars
                   - students validate against scrypt-hashed passwords
  students.ts      account/profile management (coach-only writes)
  attendance.ts    roll call + per-student history/stats
  training.ts      training sessions
  skills.ts        stroke skill progress (record-based, extensible strokes)
  goals.ts         training goals
  dashboard.ts     coach overview + student dashboard aggregates
  seed.ts          demo data
  lib/             access control, validation, stats helpers

app/
  login/                      sign-in page (no public registration)
  coach/                      dashboard, students, attendance, training,
                              skills, goals, profile
  student/                    dashboard, attendance, training, skills,
                              goals, profile
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
- **Overall training progress** is the average of the student's stroke
  skill progress; with no skill records the app shows
  "no progress recorded yet" instead of `0%`.
- **Goals** that reach 100% progress are automatically marked completed.
