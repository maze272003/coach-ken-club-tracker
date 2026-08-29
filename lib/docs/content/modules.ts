import type { DocSection } from "../types";

/**
 * Complete module documentation. Every entry describes a module that exists
 * in the codebase — see the page/component paths in each `route` field.
 */
export const modulesSection: DocSection = {
  id: "modules",
  title: "Modules",
  icon: "LayoutGrid",
  summary:
    "Reference documentation for every module in the system: purpose, access, screens, actions, data, and dependencies.",
  subsections: [
    {
      id: "m-auth",
      title: "Authentication & Sign-in",
      icon: "Lock",
      access: "public",
      route: "/login",
      blocks: [
        {
          type: "p",
          text: "Single sign-in page with one credentials provider (“password”). There is no public registration — the page explicitly tells students that accounts are created by their coach.",
        },
        {
          type: "table",
          headers: ["Aspect", "Detail"],
          rows: [
            [
              "Coach sign-in",
              "Email/password checked against server-side `COACH_EMAIL` / `COACH_PASSWORD` environment variables. The coach user record is created on first sign-in.",
            ],
            [
              "Student sign-in",
              "Email/password verified against scrypt-hashed credentials stored per account (passwords can be reset by the coach but never read).",
            ],
            [
              "Deactivated students",
              "Sign-in is refused with “This account has been deactivated. Contact your coach.”",
            ],
            [
              "Session",
              "JWT-based session via Convex Auth; role routing happens at `/` (see [Security](#sec-security)).",
            ],
          ],
        },
        {
          type: "bullets",
          items: [
            "Features: email + password form, friendly error messages via toasts, redirect by role after sign-in.",
            "Actions: sign in, sign out (from the sidebar user footer).",
          ],
        },
        {
          type: "bullets",
          items: [
            "Data: reads `users` (role, status); creates the coach `users` record on first coach sign-in.",
            "Dependencies: `users` module, server environment variables for coach credentials.",
          ],
        },
      ],
    },
    {
      id: "m-dashboard",
      title: "Coach Dashboard",
      icon: "LayoutDashboard",
      access: "coach",
      route: "/coach/dashboard",
      blocks: [
        {
          type: "p",
          text: "The coach home screen: “How are your swimmers progressing?” It aggregates every module into KPI cards, attention flags, today’s practices, recent activity, and the student roster.",
        },
        {
          type: "bullets",
          items: [
            "**Today’s Practices** card — planned practices for today with one-click *Complete practice* and a link to *Roll call*.",
            "**Needs Attention** card — attention flags across active swimmers, sorted by severity (see [Insights](#doc-m-insights)).",
            "**KPI stat cards** with month/week deltas: Attendance % (this month vs last), Weekly training volume (meters, this week vs last), PBs this month, Active swimmers.",
            "**Last week** weekly report card and **Next practices** list.",
            "**Recent Activity** feed — latest attendance records, sessions, skill updates, and goals across the squad.",
            "**Goal deadlines** — uncompleted goals due within 14 days.",
            "**Students table** with search, status, group, attendance %, progress %, and current goal.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Actions",
              "Complete a practice (dialog), jump to roll call, open any student profile, search students.",
            ],
            [
              "Data consumed",
              "Reads aggregates from `dashboard.coachOverview`, `reports.list`, `students.list`, `practices.listUpcoming`. Creates/updates nothing itself (writes happen through embedded dialogs).",
            ],
            [
              "Dependencies",
              "Attendance, Training, Skills, Goals, Times, Practices, Reports, Insights — the dashboard is a pure consumer.",
            ],
          ],
        },
      ],
    },
    {
      id: "m-students",
      title: "Students & Accounts",
      icon: "Users",
      access: "coach",
      route: "/coach/students",
      blocks: [
        {
          type: "p",
          text: "Roster management: the coach creates swimmer accounts, searches and filters the roster, and opens each swimmer’s full profile. This is the only place student accounts are created.",
        },
        {
          type: "bullets",
          items: [
            "Create student account dialog: name, avatar (upload or URL), email, temporary password + confirmation, status, optional group, date of birth, sex.",
            "Roster table: avatar, name/email, active/inactive status, group, attendance %, overall progress %, current goal, link to profile.",
            "Search by name/email and filter by group (including “Unassigned”).",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Actions",
              "Create account, search, filter by group, open student profile.",
            ],
            [
              "Data created",
              "`users` record (role student, name, email, image) + `students` profile row (status, group, DOB, sex) + password credential (scrypt hash).",
            ],
            [
              "Data consumed",
              "`students.list` (with derived attendance % and progress %), `groups.list`.",
            ],
            [
              "Validation",
              "Email must be unique and valid; password 8–128 characters; name 1–100 characters.",
            ],
            ["Dependencies", "Groups (optional assignment), Authentication."],
          ],
        },
      ],
    },
    {
      id: "m-student-detail",
      title: "Student Profile (360° view)",
      icon: "UserRound",
      access: "coach",
      route: "/coach/students/[id]",
      blocks: [
        {
          type: "p",
          text: "A single swimmer’s complete record, organized in tabs: Attendance, Times & PBs, Trends, Skills, Training, and Goals — plus profile editing and account maintenance actions.",
        },
        {
          type: "bullets",
          items: [
            "Header: avatar, name/email, **Report card** link, **Edit Profile** and **Reset Password** dialogs.",
            "Profile card: status/group badges, age, member since, parent contact info, medical notes (coach-only).",
            "Stat cards: Attendance %, **Commitment %**, Overall training progress.",
            "**Attendance tab** — record a single day, attendance summary, full history, and attendance CSV export.",
            "**Times & PBs tab** — PB trophy grid, filterable time history, log a single time, delete a result.",
            "**Trends tab** — attendance-by-month bar chart, 12-week volume line, skill radar (needs ≥ 3 skills), PB progression per event.",
            "**Skills tab** — per-student skill progress editor (0–100% per skill).",
            "**Training tab** — create/edit training sessions; session cards.",
            "**Goals tab** — create/edit/delete goals of all three types.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Actions",
              "Edit profile fields (name, avatar, group, DOB, sex, joined date, parent contacts, medical notes, status), reset password, record attendance, log/delete times, set skill progress, create/edit/delete sessions and goals, export attendance, print report card.",
            ],
            [
              "Data",
              "Reads and writes across `students`, `attendance`, `timeResults`, `strokeSkills`, `trainingSessions`, `trainingGoals`; writes `users` (name/image).",
            ],
            [
              "Dependencies",
              "Groups, Attendance, Times, Skills, Training, Goals, Insights (trends), Reports (report card).",
            ],
          ],
        },
      ],
    },
    {
      id: "m-report-card",
      title: "Athlete Report Card",
      icon: "FileText",
      access: "coach",
      route: "/coach/students/[id]/report",
      blocks: [
        {
          type: "p",
          text: "A print-ready one-page report per swimmer, computed on demand (never stored). Opened from the student profile’s **Report card** button.",
        },
        {
          type: "bullets",
          items: [
            "Stat cards: Attendance, Commitment, PBs.",
            "Active skills with progress, PB list per event, 12-week weekly volume, and goals with derived status.",
            "**Print** button opens the browser print dialog with print-optimized styling.",
          ],
        },
        {
          type: "bullets",
          items: [
            "Data: consumes `reports.athleteCard` — a live aggregate over students, attendance, practices, sessions, skills, times, and goals.",
            "Dependencies: Attendance, Training, Skills, Times, Goals (read-only).",
          ],
        },
      ],
    },
    {
      id: "m-groups",
      title: "Groups",
      icon: "UsersRound",
      access: "coach",
      route: "/coach/groups",
      blocks: [
        {
          type: "p",
          text: "Training groups organize the team and drive practices, roll call filtering, weekly reports, and commitment tracking. Groups are archived, never deleted, so history stays intact.",
        },
        {
          type: "bullets",
          items: [
            "Create and rename groups (name + description), archive and restore.",
            "Member counts and an **archived** badge; active groups sort first.",
            "**Volume by group (last 8 weeks)** line chart from team trends.",
            "Students are assigned to groups from the student profile editor.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Actions",
              "Create group, rename/edit description, archive, restore.",
            ],
            [
              "Data",
              "`groups` table (`name`, `description`, `status`, `updatedAt`); reads `insights.teamTrends` for the volume chart; member counts derived from `students`.",
            ],
            [
              "Validation",
              "Name 1–80 characters and unique among **active** groups (case-insensitive).",
            ],
            [
              "Dependencies",
              "Practices (per-group), Attendance (group filter), Reports (per-group sections), Insights.",
            ],
          ],
        },
      ],
    },
    {
      id: "m-practices",
      title: "Practices",
      icon: "CalendarClock",
      access: "coach",
      route: "/coach/practices",
      blocks: [
        {
          type: "p",
          text: "Group practice planning with a one-click completion that fans out training sessions to every attending swimmer. Practices move through **planned → completed / cancelled**.",
        },
        {
          type: "bullets",
          items: [
            "Schedule a practice: group, date, optional start time, title, planned duration/distance, focus skills, notes.",
            "Edit or cancel while still planned; the group cannot be changed after creation.",
            "**Complete practice** dialog: enter actual duration/distance (defaults to planned) — the fan-out creates or updates one training session per active group member who was not marked absent that day, and reports how many sessions were created/updated/skipped.",
            "Filter the list by group; upcoming practices and the last 30 days of history with status badges and actuals.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Data",
              "`practices` table (group, date, title, planned/actual duration & distance, strokes, status, completedAt); fan-out writes `trainingSessions` linked by `practiceId`.",
            ],
            [
              "Lifecycle rules",
              "Only planned practices can be edited or cancelled; cancelled practices cannot be completed; re-completing updates the same sessions (idempotent).",
            ],
            [
              "Dependencies",
              "Groups (must be active), Skills (focus skill keys), Attendance (absent members are skipped), Training (sessions created).",
            ],
          ],
        },
      ],
    },
    {
      id: "m-attendance",
      title: "Attendance & Roll Call",
      icon: "ClipboardCheck",
      access: "coach",
      route: "/coach/attendance",
      blocks: [
        {
          type: "p",
          text: "Daily roll call as a single bulk save per day. A month calendar shows per-day status dots; the coach marks each swimmer Present, Late, or Absent and saves once.",
        },
        {
          type: "bullets",
          items: [
            "**Calendar** (left): month navigation, per-day colored dots for present/late/absent counts, legend.",
            "**Roll call panel** (right): per-student Present/Late/Absent toggles, status count chips, group filter, **Mark all present**, **Save Roll Call** (single transaction, up to 200 entries), and a **Complete practice** shortcut when a practice is planned that day.",
            "Unsaved changes are tracked per (date, group) so you can review before saving.",
            "**Export Attendance** to CSV: scope (all or one student), date range presets or custom dates, status filter, live preview with counts/rate/training minutes/PBs.",
            "One record per student per day — re-saving a day updates it in place (upsert).",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Business rule",
              "Attended = **present + late**; absent does not count. Attendance % is always derived from the records, never stored.",
            ],
            [
              "Data",
              "`attendance` table (`studentId`, `date`, `status`); writes also trigger goal auto-completion checks.",
            ],
            [
              "Side effects",
              "Attendance % (dashboard, profiles, reports), commitment %, attention flags, calendar dots.",
            ],
            [
              "Dependencies",
              "Students (active roster), Groups (filter), Goals (auto-complete), Practices (complete shortcut).",
            ],
          ],
        },
      ],
    },
    {
      id: "m-training",
      title: "Training Sessions",
      icon: "Dumbbell",
      access: "coach",
      route: "/coach/training",
      blocks: [
        {
          type: "p",
          text: "The record of what each swimmer actually did: duration, distance, intensity, focus skills, and notes. Sessions are created manually or automatically by completing a practice.",
        },
        {
          type: "bullets",
          items: [
            "**New Session** dialog: swimmer, date, title, duration (minutes), optional distance (m) and intensity (easy/moderate/hard), focus skills (checkboxes), notes.",
            "Squad-wide feed (latest 50) with inline edit; per-student grid in the student profile **Training** tab.",
            "Sessions created by practice completion are linked to the practice and show “From practice” notes.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Data",
              "`trainingSessions` (`studentId`, optional `practiceId`, `date`, `title`, `durationMinutes`, `distanceMeters`, `intensity`, `strokes`, `notes`).",
            ],
            [
              "Validation",
              "Title 1–120 chars; duration 1–1440 min; distance 1–30000 m; at least one focus skill; notes ≤ 2000 chars.",
            ],
            [
              "Consumed by",
              "Weekly volume KPIs, trends charts, athlete report card, weekly reports, attention flags (inactivity).",
            ],
            [
              "Dependencies",
              "Skills (focus skill keys), Practices (auto-created sessions), Students.",
            ],
          ],
        },
      ],
    },
    {
      id: "m-skills",
      title: "Skills (Library & Progress)",
      icon: "Gauge",
      access: "coach",
      route: "/coach/skills",
      blocks: [
        {
          type: "p",
          text: "An extensible skill catalog (seeded with the four strokes) plus per-student progress tracking. Two tabs: **Skill Library** (catalog management) and **Student Progress** (0–100% editor).",
        },
        {
          type: "bullets",
          items: [
            "Add skills (name becomes an immutable key/slug), rename, archive/restore.",
            "Per-student progress editor with numeric input and progress bar; only changed values are saved.",
            "Archived skills keep historical data but disappear from pickers and from progress averages.",
            "**Overall training progress** for a student = average progress across active skills; with no records the app shows “no progress recorded yet” instead of 0%.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Data",
              "`skills` catalog (`key`, `name`, `status`) and `strokeSkills` progress rows (`studentId`, `stroke` = skill key, `progress` 0–100).",
            ],
            [
              "Validation",
              "Skill name 1–60 chars; duplicate active names rejected; progress must be a whole number 0–100; progress can only be set for active skills.",
            ],
            [
              "Consumed by",
              "Practices (focus skills), Training sessions, Student dashboards/skills page, athlete report card, trends radar.",
            ],
            ["Dependencies", "Students; referenced by Practices and Training."],
          ],
        },
      ],
    },
    {
      id: "m-goals",
      title: "Goals",
      icon: "Target",
      access: "coach",
      route: "/coach/goals",
      blocks: [
        {
          type: "p",
          text: "Training goals assigned by the coach. Three types with different mechanics — progress for measurable types is **derived from real data**, not typed in.",
        },
        {
          type: "table",
          headers: ["Type", "How progress works"],
          rows: [
            [
              "**Time target**",
              "Pick event (stroke + distance + course) and target time. The system captures the current best time as baseline at creation, then progress = how far the swimmer’s current best has moved from baseline toward the target. Reaching the target time completes the goal.",
            ],
            [
              "**Attendance %**",
              "Target attendance percentage (1–100). Progress = current attendance ÷ target; reaching the target completes the goal.",
            ],
            [
              "**Manual / custom**",
              "Free-text target; the coach sets progress by hand. 100% marks it completed.",
            ],
          ],
        },
        {
          type: "bullets",
          items: [
            "Goal dialog supports title, description, target date, status, and type-specific fields.",
            "Every attendance or time write re-checks the swimmer’s goals and **auto-completes at 100%**.",
            "Statuses: not started, in progress, completed, archived. Cards show measurable breakdowns (target vs current time / attendance).",
            "Goals due within 14 days surface on the coach dashboard and in attention flags.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Data",
              "`trainingGoals` (`studentId`, `title`, `type`, event fields, `targetTimeMs`, `baselineBestMs`, `targetAttendancePct`, `progress`, `status`, `targetDate`).",
            ],
            [
              "Dependencies",
              "Times (time goals), Attendance (attendance goals + auto-complete), Students.",
            ],
          ],
        },
      ],
    },
    {
      id: "m-times",
      title: "Times & Personal Bests",
      icon: "Timer",
      access: "coach",
      route: "/coach/times",
      blocks: [
        {
          type: "p",
          text: "Swim time recording with automatic PB detection. Two tabs: **Time Trial Sheet** (bulk entry for a group) and **Squad Time Log & PBs** (searchable log).",
        },
        {
          type: "bullets",
          items: [
            "**Time trial setup**: group, stroke, distance (25–1500 m from the standard set), course (SCM 25 m / LCM 50 m), date, context (practice / time trial / meet).",
            "**Trial sheet**: one row per active group swimmer with a time input and notes; live swim-time parsing; **draft autosave** to the browser (restored with a badge if you leave and come back); save the whole sheet as one bulk operation (up to 200 entries).",
            "**PB detection**: the first result for an event is a PB; later results are PBs only if strictly faster than every earlier result. New PBs trigger a celebration dialog/toasts with the delta (s and %).",
            "**Squad log**: filters (student/group/date range/stroke/distance/course/context), search, PB badges, delete with confirmation.",
            "**Export CSV** with the current filters; PB flags are computed within the exported set.",
            "Single times can also be logged from a student’s **Times & PBs** tab.",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Data",
              "`timeResults` (`studentId`, `date`, `stroke`, `distanceMeters`, `course`, `timeMs`, `context`, `notes`). Strokes: freestyle, backstroke, breaststroke, butterfly, IM.",
            ],
            [
              "Side effects",
              "PB lists (coach + student), goal auto-completion, PBs-this-month KPI, trends, weekly reports.",
            ],
            [
              "Dependencies",
              "Students, Groups (trial sheet), Goals (auto-complete), Insights/Reports (consumers).",
            ],
          ],
        },
      ],
    },
    {
      id: "m-insights",
      title: "Insights (Flags & Trends)",
      icon: "Sparkles",
      access: "coach",
      route: "/coach/dashboard",
      blocks: [
        {
          type: "p",
          text: "Derived analytics rather than a page of its own — insights power the dashboard’s **Needs Attention** card, per-student **Trends** tabs, student charts, and the groups volume chart.",
        },
        {
          type: "table",
          headers: ["Attention flag", "Trigger"],
          rows: [
            ["**Consecutive absences** (high)", "2 or more absences in a row (latest records)."],
            [
              "**Attendance drop** (medium)",
              "Attendance % fell by ≥ 15 points vs last month (with at least 3 records this month).",
            ],
            [
              "**Goal deadline** (medium)",
              "An uncompleted goal is due within 14 days.",
            ],
            [
              "**Inactivity** (medium)",
              "No training session for 21+ days (and the swimmer has been on the team 21+ days).",
            ],
            [
              "**PB plateau** (low)",
              "No PB on an event for 8+ weeks (event with at least 3 results).",
            ],
          ],
        },
        {
          type: "bullets",
          items: [
            "Flags refresh live on the dashboard; each flag links to the student.",
            "**Student trends**: 6-month attendance-by-month %, 12-week volume-by-week meters, skill radar chart (needs ≥ 3 active skills), PB progression per event.",
            "**Team trends**: team attendance % by month and training volume by group (last 8 weeks).",
          ],
        },
        {
          type: "bullets",
          items: [
            "Data: read-only over attendance, times, sessions, goals, skills, students.",
            "Dependencies: every recording module; consumed by Dashboard, student Training page, Groups page, weekly Reports.",
          ],
        },
      ],
    },
    {
      id: "m-reports",
      title: "Weekly Reports",
      icon: "FileText",
      access: "coach",
      route: "/coach/reports",
      blocks: [
        {
          type: "p",
          text: "Auto-generated team reports — one per week, every Monday at 06:00 (Asia/Manila), covering the week that just ended (Monday–Sunday).",
        },
        {
          type: "bullets",
          items: [
            "Per active group: practices held, attendance %, training volume (m), PB count, and attention flags raised.",
            "Team totals across groups, KPI grid, and an errors note when a group failed to aggregate (other groups are unaffected).",
            "Latest 12 weeks listed newest-first; printable; the newest report also appears on the coach dashboard.",
            "Generation is idempotent per week — the same week is never duplicated.",
          ],
        },
        {
          type: "bullets",
          items: [
            "Data: writes one `reports` row per week (week start + JSON payload); generation is a scheduled cron job and also runs as part of the demo seed.",
            "Dependencies: Attendance, Training, Times, Practices, Groups, Insights (flags).",
          ],
        },
      ],
    },
    {
      id: "m-student-portal",
      title: "Student Portal",
      icon: "GraduationCap",
      access: "student",
      route: "/student/dashboard",
      blocks: [
        {
          type: "p",
          text: "A read-only view of each swimmer’s own progress. Students never pass a student id — the server resolves their identity from the session, so a student can only ever see their own data.",
        },
        {
          type: "bullets",
          items: [
            "**Dashboard** — attendance %, overall training progress, PB count; skill progress rows; recent training; current goal.",
            "**Attendance** — rate summary and full history with status badges.",
            "**Times & PBs** — personal best trophy grid (event, time, course badge, date) and filterable time history with PB badges.",
            "**Training Sessions** — attendance and weekly-volume charts plus the full session history (up to 200).",
            "**Skills / Goals** — coach-maintained progress and goal cards, read-only.",
            "**Profile** — the one editable screen: display name and avatar (upload ≤ 5 MB image or URL).",
          ],
        },
        {
          type: "table",
          headers: ["", "Detail"],
          rows: [
            [
              "Actions",
              "View own data; edit own display name/avatar; sign out. Nothing else — all recording is coach-only.",
            ],
            [
              "Data",
              "Reads own attendance, times, sessions, skills, goals, profile; writes `users.name/image` for profile edits and avatar uploads to file storage.",
            ],
          ],
        },
      ],
    },
    {
      id: "m-data",
      title: "Data Overview & Demo Seed",
      icon: "Database",
      access: "coach",
      route: "/coach/data",
      blocks: [
        {
          type: "p",
          text: "A coach-only verification screen for table counts, demo accounts, and a per-swimmer data-coverage matrix — useful after seeding or migrations.",
        },
        {
          type: "bullets",
          items: [
            "Count cards for all core tables; practices broken down by status; demo account badges; groups table.",
            "**Swimmer data coverage matrix**: parent/medical presence, attendance/session/time/IM-time/skill/goal counts, goals by status, and progress per swimmer.",
          ],
        },
        {
          type: "table",
          headers: ["CLI command", "Purpose"],
          rows: [
            ["`npx convex run seed:seed`", "Seed four demo swimmers (plus groups, practices, attendance, sessions, times, goals, skills, medical notes, and a weekly report). Refuses to run twice."],
            ["`npx convex run seed:resetDemo`", "Delete the demo accounts, demo groups, their practices, and all reports. Manual students are untouched."],
            ["`npx convex run seed:status`", "Table counts + which demo accounts exist (same data as this page)."],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Demo data is for development",
          text: "Demo accounts use a shared public password and are meant for dev/demo deployments only. Reset them before using the app with real swimmers.",
        },
      ],
    },
    {
      id: "m-profiles",
      title: "Profiles",
      icon: "User",
      access: "both",
      route: "/coach/profile · /student/profile",
      blocks: [
        {
          type: "p",
          text: "Account information pages for both roles, with different capabilities.",
        },
        {
          type: "table",
          headers: ["Page", "Capabilities"],
          rows: [
            [
              "`/coach/profile`",
              "Read-only: name, email, avatar, role. Notes that coach credentials come from server environment variables and cannot be changed in the app.",
            ],
            [
              "`/student/profile`",
              "Edit display name and avatar (upload or URL), plus a training summary (athlete info, attendance %, progress %).",
            ],
          ],
        },
      ],
    },
  ],
};
