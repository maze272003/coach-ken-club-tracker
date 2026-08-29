import type { DocSection } from "../types";

export const rolesSection: DocSection = {
  id: "user-flows",
  title: "User Flows by Role",
  icon: "Route",
  summary:
    "What each role does from first login to daily use — and what they cannot do.",
  subsections: [
    {
      id: "uf-coach",
      title: "Coach Flow",
      icon: "UserRound",
      access: "coach",
      blocks: [
        {
          type: "flow",
          label: "First-time setup",
          nodes: [
            "Sign in with coach credentials",
            "Create groups",
            "Create student accounts",
            "Assign students to groups",
            "Schedule practices",
          ],
        },
        {
          type: "flow",
          label: "Weekly rhythm",
          nodes: [
            "Dashboard: check KPIs & flags",
            "Roll call for each practice day",
            "Complete practice (sessions auto-log)",
            "Record time trials",
            "Update skill progress & goals",
            "Review weekly report (Mon 06:00)",
          ],
        },
        {
          type: "steps",
          intro: "A typical practice day:",
          steps: [
            {
              title: "Before practice",
              detail: "Open **Attendance**, pick today on the calendar, mark the roll call for the group and save.",
            },
            {
              title: "After practice",
              detail: "Open the practice from **Dashboard → Today’s Practices** or **Practices**, enter actual duration/distance, and complete it — sessions are logged automatically for everyone who attended.",
            },
            {
              title: "During/after time trials",
              detail: "Open **Times**, set up the trial sheet for the group and event, enter times, save — new PBs are celebrated automatically.",
            },
            {
              title: "Follow-up",
              detail: "Check **Dashboard → Needs Attention** and goal deadlines; update skill progress from a student’s **Skills** tab.",
            },
          ],
        },
        {
          type: "table",
          headers: ["The coach can…", "The coach cannot…"],
          rows: [
            [
              "Create, edit, and deactivate student accounts; reset student passwords",
              "Read or recover existing student passwords (they are hashed)",
            ],
            [
              "Manage groups, practices, roll call, training, skills, goals, and times",
              "Change the practice’s group after creation (recreate it instead)",
            ],
            [
              "View every swimmer’s full profile, trends, and report card",
              "Delete groups or skills (they are archived, keeping history)",
            ],
            [
              "Export times and attendance to CSV; print reports",
              "Delete students or their history (except the demo seed reset)",
            ],
            [
              "Seed and reset demo data from the CLI",
              "Change coach email/password inside the app (environment variables only)",
            ],
          ],
        },
      ],
    },
    {
      id: "uf-student",
      title: "Student Flow",
      icon: "GraduationCap",
      access: "student",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Sign in with coach-provided account",
            "Dashboard: attendance, progress, PBs",
            "Explore Times & PBs / Training / Skills / Goals",
            "Edit profile (name, avatar)",
            "Ask coach for password reset if needed",
          ],
        },
        {
          type: "bullets",
          items: [
            "The dashboard answers “how am I doing?”: attendance %, overall training progress, and personal best count at a glance.",
            "**Times & PBs** shows the trophy wall of bests per event plus the full history; **Training Sessions** adds attendance/volume charts.",
            "**Goals** and **Skills** are maintained by the coach — students track, the coach records.",
            "Password resets are done by the coach; resetting signs the student out everywhere.",
          ],
        },
        {
          type: "table",
          headers: ["The student can…", "The student cannot…"],
          rows: [
            [
              "View all of their own data (attendance, times, sessions, skills, goals)",
              "See any other student’s data — enforced server-side, not just hidden in the UI",
            ],
            [
              "Edit their display name and avatar",
              "Edit attendance, times, sessions, skills, or goals",
            ],
            ["Sign in and out on any device", "Create accounts or reset their own password"],
            ["Filter their time history and PBs", "Export data (exports are coach-only)"],
          ],
        },
      ],
    },
  ],
};
