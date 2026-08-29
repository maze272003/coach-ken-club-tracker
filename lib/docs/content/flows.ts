import type { DocSection } from "../types";

export const flowsSection: DocSection = {
  id: "flows",
  title: "Module Flows",
  icon: "Workflow",
  summary:
    "End-to-end workflows and how data moves between modules.",
  subsections: [
    {
      id: "f-signin",
      title: "Sign-in & Role Routing",
      icon: "Lock",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Open app",
            "/login",
            "Enter email + password",
            "Provider validates",
            "Session created",
            "Role router at /",
            "Coach or Student dashboard",
          ],
        },
        {
          type: "bullets",
          items: [
            "The provider checks the coach credentials against server environment variables first; otherwise it verifies the student’s scrypt-hashed password.",
            "Inactive students are rejected at sign-in; students without a student profile cannot sign in either.",
            "After sign-in, `/` reads the session’s role server-side and redirects: coach → `/coach/dashboard`, student → `/student/dashboard`, no session → `/login`.",
          ],
        },
      ],
    },
    {
      id: "f-practice",
      title: "Practice Lifecycle (Plan → Complete → Auto-log)",
      icon: "CalendarClock",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Create group",
            "Add students to group",
            "Schedule practice (planned)",
            "Practice day: take roll call",
            "Complete practice + actuals",
            "Sessions auto-logged",
            "Dashboards & KPIs update",
          ],
        },
        {
          type: "steps",
          intro: "What happens when a practice is completed:",
          steps: [
            {
              title: "Fan-out per member",
              detail: "For every active student in the practice’s group, the system checks that day’s attendance.",
            },
            {
              title: "Absent swimmers are skipped",
              detail: "Anyone marked absent that day does not get a session; inactive students are also skipped.",
            },
            {
              title: "One session per swimmer, linked to the practice",
              detail: "Title comes from the practice; notes are prefixed “From practice:”. Duration/distance default to the actuals you entered.",
            },
            {
              title: "Re-completing is safe",
              detail: "Running completion again updates the same sessions instead of duplicating them (linked by student + practice).",
            },
            {
              title: "Everything downstream updates",
              detail: "Weekly volume KPIs, trends, athlete report cards, and Monday’s weekly report pick up the new sessions automatically.",
            },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Lifecycle rules",
          text: "Only **planned** practices can be edited or cancelled, a practice’s group can never be changed (recreate it instead), and cancelled practices cannot be completed later.",
        },
      ],
    },
    {
      id: "f-rollcall",
      title: "Daily Roll Call",
      icon: "ClipboardCheck",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Attendance page",
            "Pick date on calendar",
            "Optionally filter by group",
            "Mark Present / Late / Absent",
            "Save Roll Call (one bulk save)",
            "Records upserted",
            "Goals & stats re-derived",
          ],
        },
        {
          type: "bullets",
          items: [
            "One attendance record per student per day — saving a day again updates it in place.",
            "Attended = present + late. The percentage shown everywhere is always recomputed from the records.",
            "Saving triggers a goal auto-complete check for every swimmer in the save (attendance-target goals may complete).",
            "The calendar dots, dashboards, commitment %, flags, and exports all update immediately.",
          ],
        },
      ],
    },
    {
      id: "f-timetrial",
      title: "Time Trial → Personal Best → Goal",
      icon: "Timer",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Times page → Time Trial Sheet",
            "Choose group / event / date / context",
            "Enter times (draft autosaves)",
            "Save Time Trial (bulk)",
            "PB detection per swimmer",
            "Celebration dialog for new PBs",
            "Goals auto-complete check",
            "PB lists, KPIs, trends update",
          ],
        },
        {
          type: "bullets",
          items: [
            "Times are entered as swim-time strings (e.g. `28.45` or `1:04.25`) and parsed live — invalid entries are flagged before you can save.",
            "A result is a PB only if it is strictly faster than every earlier result for the same event (stroke + distance + course); the very first result for an event counts as a PB.",
            "If a time-target goal exists for that event, reaching the target time completes the goal automatically.",
          ],
        },
      ],
    },
    {
      id: "f-goal",
      title: "Goal Lifecycle",
      icon: "Target",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Coach creates goal (type)",
            "Baseline captured (time goals)",
            "Swimmer trains — times / attendance recorded",
            "Progress derived automatically",
            "Reaches 100%",
            "Marked completed",
          ],
        },
        {
          type: "bullets",
          items: [
            "Time goals capture the swimmer’s current best time as the baseline at creation (or you can set it), then measure progress from baseline toward the target.",
            "Attendance goals measure current attendance % against the target %.",
            "Manual goals are updated by the coach by hand.",
            "The auto-complete check runs after every attendance save, time save, and goal update.",
          ],
        },
      ],
    },
    {
      id: "f-weekly",
      title: "Weekly Report Generation",
      icon: "FileText",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Cron: Monday 06:00 (Asia/Manila)",
            "Aggregate the week that just ended",
            "Per active group: practices, attendance %, volume, PBs, flags",
            "Failures isolated per group",
            "Stored by week (idempotent)",
            "Visible on /coach/reports + dashboard",
          ],
        },
        {
          type: "bullets",
          items: [
            "Weeks run Monday–Sunday in the coach timezone; the report covers the complete week that ended the day before.",
            "If one group’s aggregation fails, the rest of the report still generates and the failed group is listed in an errors note.",
            "Re-running for the same week replaces the previous report — one document per week, latest 12 shown.",
          ],
        },
      ],
    },
    {
      id: "f-data-movement",
      title: "How Data Moves Between Modules",
      icon: "Route",
      blocks: [
        {
          type: "table",
          headers: ["From", "To", "What moves"],
          rows: [
            ["Groups", "Practices, Attendance, Reports", "Group membership scopes practices, roll-call filters, and per-group report sections."],
            ["Practices", "Training Sessions", "Completing a practice auto-logs linked sessions for attending members."],
            ["Attendance", "Dashboards, Goals, Insights, Reports", "Attended counts feed percentages; writes trigger goal auto-completion; records drive flags and reports."],
            ["Times", "Goals, Insights, Reports, Student portal", "PB detection feeds goal progress, PB KPIs, trends, and both PB views."],
            ["Skills catalog", "Practices, Training, Skills progress", "Skill keys tag focus work; catalog status controls pickers and progress averaging."],
            ["Skill progress", "Dashboards, Report card, Trends", "Overall training progress is the average across active skills."],
            ["Students", "Everything", "Ownership anchor: every record belongs to a student; student views resolve identity from the session."],
          ],
        },
      ],
    },
  ],
};
