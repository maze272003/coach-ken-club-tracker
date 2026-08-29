import type { DocSection } from "../types";

export const referenceSection: DocSection = {
  id: "reference",
  title: "Reference",
  icon: "CircleHelp",
  summary: "Glossary, operational limits, and implementation status at a glance.",
  subsections: [
    {
      id: "r-glossary",
      title: "Glossary",
      icon: "BookOpen",
      blocks: [
        {
          type: "table",
          headers: ["Term", "Meaning"],
          rows: [
            ["Attended", "Present + Late. Absent never counts toward percentages."],
            ["Attendance %", "Attended records ÷ total roll-call records, rounded."],
            ["Commitment %", "Attended ÷ completed group practices since the swimmer’s join date."],
            ["PB (Personal Best)", "A result strictly faster than every earlier result for the same event."],
            ["Event", "Stroke + distance + course combination, e.g. “100m Freestyle (SCM)”."],
            ["SCM / LCM", "Short course (25 m pool) / long course (50 m pool)."],
            ["IM", "Individual Medley — one of the five time strokes."],
            ["Roll call", "The daily bulk attendance save."],
            ["Fan-out", "Completing a practice auto-logging a linked session per attending member."],
            ["Skill key", "The immutable slug a skill gets when created; records keep pointing at it even after renames."],
            ["Overall training progress", "Average skill progress across **active** skills."],
            ["Attention flag", "Automatic warning on the coach dashboard (absence streak, attendance drop, goal deadline, inactivity, PB plateau)."],
            ["Week", "Monday–Sunday in the coach timezone (Asia/Manila)."],
          ],
        },
      ],
    },
    {
      id: "r-limits",
      title: "Operational Limits",
      icon: "Gauge",
      blocks: [
        {
          type: "table",
          headers: ["Where", "Limit"],
          rows: [
            ["Roll call bulk save", "1–200 entries per save"],
            ["Time trial bulk save", "1–200 entries per batch"],
            ["CSV exports", "Up to 5,000 rows"],
            ["Session history feeds", "1–200 per query (coach feed default 50; student page shows 200)"],
            ["Attendance history per student view", "Most recent 500 records"],
            ["Weekly reports shown", "Latest 12"],
            ["Password length", "8–128 characters"],
            ["Names", "Students 1–100 chars; groups 1–80; skills 1–60; titles 1–120"],
            ["Notes", "Sessions/goals 2,000 chars; practices 5,000; times 500; medical notes 2,000"],
            ["Distance (sessions/practices)", "1–30,000 m"],
            ["Duration", "1–1,440 minutes"],
            ["Avatar uploads", "Image files up to 5 MB (or an image URL)"],
          ],
        },
      ],
    },
    {
      id: "r-status",
      title: "Implementation Status",
      icon: "CircleCheck",
      blocks: [
        {
          type: "p",
          text: "Everything documented on this page reflects the current codebase. For transparency, this is the full status picture:",
        },
        {
          type: "statusList",
          items: [
            { label: "Coach & student areas (all pages listed in Modules)", status: "implemented" },
            { label: "Attendance, practices, training, skills, goals, times incl. bulk ops & exports", status: "implemented" },
            { label: "Dashboards, insights flags, trends, weekly reports & cron", status: "implemented" },
            { label: "Demo seed & data overview", status: "implemented" },
            {
              label: "Dark mode",
              status: "partial",
              note: "A dark theme exists in the design tokens, but no theme toggle is exposed in the UI.",
            },
            {
              label: "Parent weekly email reports",
              status: "partial",
              note: "Backend queue + Gmail SMTP mailer are under construction; no user-facing screens or schedules yet.",
            },
          ],
        },
      ],
    },
  ],
};
