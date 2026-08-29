import type { DocSection } from "../types";

export const overviewSection: DocSection = {
  id: "overview",
  title: "System Overview",
  icon: "BookOpen",
  summary:
    "What CoachKen Tracker is, who uses it, and how the pieces fit together.",
  subsections: [
    {
      id: "what-it-is",
      title: "What is CoachKen Tracker?",
      icon: "Waves",
      access: "public",
      route: "/login",
      blocks: [
        {
          type: "p",
          text: "CoachKen Tracker is a focused **swimmer training and progress tracking app** for one coach and their swimmers. The coach manages student accounts and records attendance, training sessions, stroke skill progress, and training goals. Students sign in and see their own progress.",
        },
        {
          type: "bullets",
          items: [
            "**Training groups** organize the team; the coach schedules **group practices** and completes them in one click — a training session is logged automatically for every swimmer who attended.",
            "**Roll call** is a single bulk save per group per day (Present / Late / Absent).",
            "**Swim times** are recorded per event (stroke, distance, course) with automatic **personal best (PB) detection**.",
            "**Skill programs** are an extensible catalog; per-student progress is tracked 0–100%.",
            "**Goals** can be manual, time-target, or attendance-target based, with progress derived automatically from real data.",
            "**Dashboards, insights, and weekly reports** turn the recorded data into KPIs, attention flags, and trends.",
          ],
        },
        {
          type: "statusList",
          items: [
            { label: "Coach area (12 pages)", status: "implemented" },
            { label: "Student area (7 pages)", status: "implemented" },
            { label: "Weekly report automation (cron)", status: "implemented" },
            { label: "CSV exports (times, attendance)", status: "implemented" },
            {
              label: "Parent weekly email reports",
              status: "partial",
              note: "Backend in construction — no user-facing screens yet.",
            },
          ],
        },
      ],
    },
    {
      id: "roles",
      title: "User Roles",
      icon: "Users",
      access: "public",
      blocks: [
        {
          type: "p",
          text: "The system has exactly **two user roles**. There is no public registration: student accounts are created exclusively by the coach.",
        },
        {
          type: "table",
          headers: ["Role", "How accounts exist", "Can", "Cannot"],
          rows: [
            [
              "**Coach** (single account)",
              "Validated against server-side `COACH_EMAIL` / `COACH_PASSWORD` environment variables; the coach user record is created automatically on first sign-in.",
              "Everything: manage students, groups, practices, roll call, training sessions, skills, goals, times, exports, reports, demo data.",
              "Read student passwords (they are hashed); change coach credentials inside the app.",
            ],
            [
              "**Student** (swimmer)",
              "Created by the coach (or the demo seed) with an email and a temporary password.",
              "View own dashboard, attendance, times & PBs, training history, skills, goals; edit own display name and avatar.",
              "Edit any recorded data (attendance, sessions, times, skills, goals); see other students; create accounts.",
            ],
            [
              "*Inactive student* (state, not a role)",
              "Coach deactivates a student from the student profile.",
              "Nothing — data is retained.",
              "Sign in (blocked with a “deactivated” message) or appear in roll call, dashboards, or reports.",
            ],
          ],
        },
      ],
    },
    {
      id: "how-it-works",
      title: "How the System Works",
      icon: "Workflow",
      access: "public",
      blocks: [
        {
          type: "p",
          text: "At a high level, the coach records what happens at the pool, and the system derives everything else — percentages, PBs, flags, KPIs, and reports — automatically.",
        },
        {
          type: "flow",
          label: "End-to-end lifecycle",
          nodes: [
            "Sign in",
            "Set up groups & students",
            "Schedule practices",
            "Daily roll call",
            "Complete practice → auto sessions",
            "Record times, skills, goals",
            "Derived: PBs, %, flags, KPIs",
            "Weekly reports",
            "Students view progress",
          ],
        },
        {
          type: "bullets",
          items: [
            "**Plan** — the coach creates training groups, adds swimmer accounts, and schedules group practices (date, time, planned duration/distance, focus skills).",
            "**Run** — on practice day the coach takes roll call (one bulk save) and completes the practice; a training session is logged automatically for every active group member who was not marked absent.",
            "**Record** — swim times (with automatic PB detection), skill progress updates, and goals are recorded per swimmer.",
            "**Derive** — attendance %, commitment %, overall skill progress, goal progress, attention flags, and dashboard KPIs are computed from the records; goals reaching 100% are completed automatically.",
            "**Review** — the coach reviews dashboards, trends, and weekly reports; students see their own progress in the student portal.",
            "**Sync** — every screen updates live through Convex realtime sync; all authorization is enforced server-side in the Convex functions, never in the browser.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Business week & timezone",
          text: "Weeks start on **Monday** and all date math for weekly volume, weekly reports, and KPIs runs in the coach timezone **Asia/Manila (UTC+8)**. Weekly reports are generated every Monday at 06:00.",
        },
      ],
    },
  ],
};
