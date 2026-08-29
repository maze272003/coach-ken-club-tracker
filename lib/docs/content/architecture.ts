import type { DocSection } from "../types";

export const architectureSection: DocSection = {
  id: "architecture",
  title: "System Architecture",
  icon: "Server",
  summary:
    "The technology stack, how the components communicate, and the data model behind the app.",
  subsections: [
    {
      id: "a-stack",
      title: "Technology Stack",
      icon: "Layers",
      blocks: [
        {
          type: "table",
          headers: ["Layer", "Technology", "Notes"],
          rows: [
            ["Frontend", "Next.js 16 (App Router), React 19, TypeScript", "Server layouts enforce role redirects; pages are client components with live queries."],
            ["UI", "Tailwind CSS v4, local shadcn/ui-style component kit, lucide icons, recharts, sonner toasts", "Consistent design system in `components/ui` and `components/shared`."],
            ["Backend", "Convex — queries, mutations, and actions", "Every function is a transaction; actions handle auth-sensitive flows (account creation, password reset)."],
            ["Database", "Convex built-in document database", "Ten domain tables plus auth tables; indexed per the data model below."],
            ["Authentication", "Convex Auth (`@convex-dev/auth`), single password provider", "Coach credentials from environment variables; student passwords scrypt-hashed. JWT sessions."],
            ["File storage", "Convex file storage", "Used for avatar uploads (images ≤ 5 MB)."],
            ["Scheduling", "Convex cron jobs", "Weekly report generation, Monday 06:00 Asia/Manila (`0 22 * * 0` UTC)."],
            ["HTTP", "Convex HTTP router", "Auth endpoints only (`/api/auth/*`); no custom HTTP APIs."],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "The running app uses **no third-party external services** — everything (database, auth, storage, scheduling, hosting of server functions) runs on the Convex platform. A parent-email feature with Gmail SMTP delivery is under construction on the backend and is not wired into any screen or schedule yet.",
        },
      ],
    },
    {
      id: "a-communication",
      title: "How Components Communicate",
      icon: "Route",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Browser",
            "Next.js server layouts (auth check + redirect)",
            "React pages (client)",
            "ConvexReactClient (WebSocket, realtime)",
            "Convex functions (validate + authorize)",
            "Convex database",
          ],
        },
        {
          type: "bullets",
          items: [
            "**Sign-in** posts credentials to Convex Auth; a JWT session cookie is set and attached to every request.",
            "**Role routing** happens twice: server layouts call `users.currentUser` with the session token to redirect unauthenticated or wrong-role visitors, and every Convex function independently re-checks the caller’s role — the client check is only for navigation, never for security.",
            "**Live data**: pages subscribe to queries over a WebSocket; any mutation (from any device) re-renders every subscribed screen automatically. There is no manual refreshing.",
            "**Writes** go through mutations/actions that validate input, check authorization, and update the database in a single transaction.",
            "**Cron** runs inside Convex on schedule — the weekly report is generated server-side with no external trigger.",
          ],
        },
      ],
    },
    {
      id: "a-datamodel",
      title: "Data Model",
      icon: "Database",
      blocks: [
        {
          type: "table",
          headers: ["Table", "Key fields", "Purpose"],
          rows: [
            ["`users`", "name, email, image, **role** (coach/student)", "Identities for both roles; auth sessions link here."],
            ["`students`", "userId, groupId, status, DOB, sex, parent contacts, medicalNotes, joinedAt", "Swimmer profile; one row per student account."],
            ["`groups`", "name, description, status (active/archived)", "Training groups; archived, never deleted."],
            ["`skills`", "key (immutable slug), name, status", "Skill catalog (seeded with the four strokes)."],
            ["`strokeSkills`", "studentId, stroke (skill key), progress 0–100", "Per-student skill progress."],
            ["`attendance`", "studentId, date, status (present/late/absent)", "One record per swimmer per day (upserted)."],
            ["`practices`", "groupId, date, title, planned/actual duration & distance, strokes, status", "Group practice plan and completion state."],
            ["`trainingSessions`", "studentId, optional practiceId, date, duration, distance, intensity, strokes", "What each swimmer did; auto-created by practice completion."],
            ["`timeResults`", "studentId, date, stroke, distanceMeters, course, timeMs, context", "Swim times; the basis for PBs."],
            ["`trainingGoals`", "studentId, type (manual/time/attendance), event + target fields, progress, status, targetDate", "Goals with derived progress."],
            ["`reports`", "weekStart, payloadJson", "One weekly team report per week."],
            ["auth tables", "accounts, sessions, refresh tokens", "Managed by Convex Auth."],
          ],
        },
        {
          type: "bullets",
          items: [
            "Dates are `YYYY-MM-DD` strings; times of day are `HH:MM` 24-hour strings; swim times are integer milliseconds.",
            "Attendance is unique per (student, date); skill progress per (student, skill); fan-out sessions per (student, practice).",
            "No cascading deletes exist in normal use — groups and skills are archived, students are deactivated; only the demo reset removes data.",
          ],
        },
      ],
    },
    {
      id: "a-folders",
      title: "Code Layout",
      icon: "BookOpen",
      blocks: [
        {
          type: "code",
          title: "Repository structure (abbreviated)",
          code: "app/\n  login/                 sign-in page (no public registration)\n  coach/                 dashboard, students (+[id], +report), groups,\n                         practices, times, reports, attendance,\n                         training, skills, goals, data, profile\n  student/               dashboard, attendance, times, training,\n                         skills, goals, profile\nconvex/\n  schema.ts              tables + indexes\n  auth.ts                password provider (coach env / student scrypt)\n  users.ts students.ts   identity + account & profile management\n  groups.ts practices.ts team structure + practice fan-out\n  attendance.ts          roll call (single + bulk) + exports\n  training.ts skills.ts  sessions + skill catalog/progress\n  goals.ts times.ts      goals w/ derived progress + PB engine\n  dashboard.ts insights.ts reports.ts\n                         aggregates: KPIs, flags, trends, weekly reports\n  dataOverview.ts seed.ts  coverage matrix + demo data\n  crons.ts http.ts        weekly cron + auth HTTP routes\n  lib/                   access control, validation, stats, flags\ncomponents/\n  ui/ shared/ coach/ student/ students/ layout/",
        },
      ],
    },
  ],
};
