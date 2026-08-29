import type { DocSection } from "../types";

export const howToSection: DocSection = {
  id: "how-to",
  title: "How to Use the System",
  icon: "ListChecks",
  summary:
    "Step-by-step instructions for common tasks — where to go, what to click, and what happens next.",
  subsections: [
    {
      id: "h-signin",
      title: "Sign in",
      icon: "Lock",
      access: "public",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Go to the app URL", detail: "You will be redirected to `/login` if you are not signed in." },
            { title: "Enter your email and password", detail: "Coaches use the credentials configured on the server; students use the temporary password given by the coach." },
            { title: "Select **Sign in**", detail: "" },
            { title: "You land on your dashboard", detail: "Coach → `/coach/dashboard`, student → `/student/dashboard`." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Forgot a password?",
          text: "Students ask the coach to reset it (see [Reset a student password](#doc-h-reset-password)). Coach credentials are managed via server environment variables.",
        },
      ],
    },
    {
      id: "h-create-student",
      title: "Create a student account",
      icon: "Users",
      access: "coach",
      route: "/coach/students",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Students**", detail: "In the sidebar under the coach area." },
            { title: "Select **Create Student**", detail: "Opens the create dialog." },
            { title: "Fill in required fields", detail: "Name, unique email, temporary password (8–128 chars, typed twice). Optional: avatar, group, date of birth, sex, status." },
            { title: "Select **Create Student** to confirm", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** the swimmer appears in the roster immediately and can sign in with the temporary password. If the email is already used, you get a clear “already exists” error and nothing is created.",
        },
      ],
    },
    {
      id: "h-rollcall",
      title: "Record daily roll call",
      icon: "ClipboardCheck",
      access: "coach",
      route: "/coach/attendance",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Attendance**", detail: "A month calendar is shown on the left." },
            { title: "Pick the date", detail: "Select the day on the calendar (today is highlighted)." },
            { title: "Optionally filter by group", detail: "Use the group selector above the swimmer list, e.g. to run roll call one group at a time." },
            { title: "Mark each swimmer", detail: "Tap **Present**, **Late**, or **Absent** per swimmer, or use **Mark all present** and adjust exceptions." },
            { title: "Select **Save Roll Call**", detail: "Everything saves in one bulk operation (up to 200 swimmers)." },
          ],
        },
        {
          type: "p",
          text: "**Result:** a toast confirms how many records were saved. Calendar dots, attendance percentages, dashboards, and attendance goals update immediately. Saving the same day again updates the records instead of duplicating them.",
        },
      ],
    },
    {
      id: "h-schedule-practice",
      title: "Schedule a practice",
      icon: "CalendarClock",
      access: "coach",
      route: "/coach/practices",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Practices**", detail: "" },
            { title: "Choose the group", detail: "Select a group filter — the practice list and scheduler work per group." },
            { title: "Select **Schedule Practice**", detail: "" },
            { title: "Fill in the plan", detail: "Title, date, optional start time (`HH:MM`), planned duration (minutes), optional planned distance (m), at least one focus skill, optional notes." },
            { title: "Save", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** the practice appears under **Upcoming** (and on the dashboard’s Next practices). It stays editable until completed or cancelled; the group can never be changed after creation.",
        },
      ],
    },
    {
      id: "h-complete-practice",
      title: "Complete a practice (auto-log sessions)",
      icon: "CircleCheck",
      access: "coach",
      route: "/coach/practices · /coach/dashboard · /coach/attendance",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Take roll call first", detail: "Absent swimmers will be skipped by the fan-out — mark attendance before completing." },
            { title: "Open **Complete Practice**", detail: "From the practice card (Practices page), Today’s Practices (dashboard), or the roll-call panel shortcut." },
            { title: "Enter actuals", detail: "Actual duration and distance pre-filled from the plan — adjust if reality differed." },
            { title: "Confirm completion", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** a toast reports how many sessions were created, updated, and skipped. Each active group member who was not marked absent gets one training session linked to the practice; weekly volume, trends, and the next weekly report update automatically.",
        },
      ],
    },
    {
      id: "h-timetrial",
      title: "Run a group time trial",
      icon: "Timer",
      access: "coach",
      route: "/coach/times",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Times** → **Time Trial Sheet** tab", detail: "" },
            { title: "Set up the trial", detail: "Group, stroke, distance, course (SCM/LCM), date, and context (practice / time trial / meet)." },
            { title: "Enter times", detail: "One row per swimmer, e.g. `28.45` or `1:04.25`. Parsing is live — invalid input is flagged immediately. Your sheet autosaves as a draft in this browser." },
            { title: "Select **Save Time Trial**", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** all valid entries are saved in one batch. If any swimmer set a personal best, a celebration dialog lists the new PBs with their improvements; time goals that reached their target complete automatically.",
        },
        {
          type: "callout",
          tone: "info",
          title: "Draft autosave",
          text: "If you navigate away mid-trial, reopening the same trial setup restores your draft (a “Draft Restored” badge appears). Drafts live in this browser only.",
        },
      ],
    },
    {
      id: "h-log-single-time",
      title: "Log a single swim time",
      icon: "Timer",
      access: "coach",
      route: "/coach/students/[id] (Times & PBs tab)",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open the swimmer’s profile", detail: "**Students** → select the swimmer → **Times & PBs** tab." },
            { title: "Select **Log Time**", detail: "The button appears in the tab (and in the empty state if no times exist yet)." },
            { title: "Enter the details", detail: "Date, stroke, distance, course, time, context, optional notes." },
            { title: "Save", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** the time is saved instantly; if it is a new PB you get a celebratory toast with the exact improvement. The time history and PB grid update immediately.",
        },
      ],
    },
    {
      id: "h-export",
      title: "Export times or attendance to CSV",
      icon: "FileText",
      access: "coach",
      route: "/coach/times · /coach/attendance",
      blocks: [
        {
          type: "steps",
          intro: "Times export:",
          steps: [
            { title: "Open **Times**", detail: "Apply any filters you want (student/group/date range/event/context) on the **Squad Time Log & PBs** tab." },
            { title: "Select **Export CSV**", detail: "" },
            { title: "Open the downloaded file", detail: "Named per your filters; includes names, events, times, and PB flags for the exported set." },
          ],
        },
        {
          type: "steps",
          intro: "Attendance export:",
          steps: [
            { title: "Open **Attendance** (or a student’s Attendance tab)", detail: "" },
            { title: "Select **Export Attendance**", detail: "Opens the export dialog." },
            { title: "Choose scope and range", detail: "All students or one swimmer; this month / last 30 days / all time / custom dates; optional status filter. A live preview shows counts, attendance rate, training minutes, and PBs." },
            { title: "Select **Export CSV**", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** a `.csv` file downloads, ready for Excel/Sheets. Exports are capped at 5,000 rows.",
        },
      ],
    },
    {
      id: "h-create-goal",
      title: "Create a goal",
      icon: "Target",
      access: "coach",
      route: "/coach/goals · /coach/students/[id] (Goals tab)",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Goals** and pick the swimmer", detail: "Or use the swimmer’s profile **Goals** tab (swimmer pre-selected)." },
            { title: "Select **New Goal**", detail: "" },
            { title: "Choose the type", detail: "**Time target** (event + target time — baseline is captured automatically), **Attendance %** (target percentage), or **Manual** (free-text target you score yourself)." },
            { title: "Add details", detail: "Title (required), optional description and target date." },
            { title: "Save", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** the goal card shows derived progress. Time and attendance goals update themselves as results come in and flip to **completed** automatically at 100%; goals due within 14 days surface on the dashboard.",
        },
      ],
    },
    {
      id: "h-skills",
      title: "Manage skills & update progress",
      icon: "Gauge",
      access: "coach",
      route: "/coach/skills",
      blocks: [
        {
          type: "steps",
          intro: "Skill library:",
          steps: [
            { title: "Open **Skills** → **Skill Library** tab", detail: "" },
            { title: "Add a skill", detail: "Type a name (1–60 chars) and add — it becomes a permanent key that history keeps pointing at, even if renamed later." },
            { title: "Rename or archive", detail: "Inline rename, or archive to hide it from pickers while keeping past data. Restore any time." },
          ],
        },
        {
          type: "steps",
          intro: "Student progress:",
          steps: [
            { title: "Open **Skills** → **Student Progress** tab (or a swimmer’s Skills tab)", detail: "" },
            { title: "Pick the swimmer", detail: "" },
            { title: "Set progress per skill", detail: "Whole numbers 0–100; the bar previews as you type." },
            { title: "Select **Save**", detail: "Only changed skills are written." },
          ],
        },
        {
          type: "p",
          text: "**Result:** the student’s overall training progress (average across active skills) updates on their dashboard and profile immediately.",
        },
      ],
    },
    {
      id: "h-groups",
      title: "Create & manage groups; assign a swimmer",
      icon: "UsersRound",
      access: "coach",
      route: "/coach/groups",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Groups**", detail: "" },
            { title: "Create: select **Create Group**", detail: "Name (1–80 chars, unique among active groups) and optional description." },
            { title: "Rename: select **Rename** on the group", detail: "" },
            { title: "Archive/restore", detail: "Archiving hides the group from active use but keeps members and history. Archived groups show a badge and can be restored." },
            { title: "Assign a swimmer", detail: "Open the swimmer’s profile → **Edit** → choose the group → save. Assignment only changes when you pick a different group." },
          ],
        },
      ],
    },
    {
      id: "h-edit-student",
      title: "Edit a student profile / deactivate",
      icon: "UserRound",
      access: "coach",
      route: "/coach/students/[id]",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Students** → the swimmer", detail: "" },
            { title: "Select **Edit Profile**", detail: "Name, avatar (upload or URL), group, date of birth, sex, joined date, parent contacts, medical notes, status." },
            { title: "Change **Status** to inactive to deactivate", detail: "Inactive students cannot sign in and drop out of roll call, dashboards, and reports — their data is kept." },
            { title: "Save", detail: "" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "The email address is fixed after account creation — deactivate and create a new account if a swimmer’s email must change.",
        },
      ],
    },
    {
      id: "h-reset-password",
      title: "Reset a student password",
      icon: "KeyRound",
      access: "coach",
      route: "/coach/students/[id]",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open the swimmer’s profile", detail: "" },
            { title: "Select **Reset Password**", detail: "" },
            { title: "Enter and confirm the new password", detail: "8–128 characters." },
            { title: "Confirm", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** the new password works immediately and the student is signed out of all devices. Passwords are never visible to the coach at any point.",
        },
      ],
    },
    {
      id: "h-report-card",
      title: "Print an athlete report card",
      icon: "FileText",
      access: "coach",
      route: "/coach/students/[id]/report",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open the swimmer’s profile", detail: "" },
            { title: "Select **Report card**", detail: "Opens the printable report." },
            { title: "Select **Print**", detail: "Uses the browser print dialog with print-optimized styling — perfect for posting on a notice board or handing to parents." },
          ],
        },
        {
          type: "p",
          text: "**Result:** a one-page snapshot with attendance/commitment/PB stats, skills, PBs, weekly volume, and goals — always computed live from the current data.",
        },
      ],
    },
    {
      id: "h-weekly-reports",
      title: "Review weekly reports",
      icon: "FileText",
      access: "coach",
      route: "/coach/reports",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Reports**", detail: "Newest first, one card per week, Monday 06:00 generation." },
            { title: "Review per-group rows", detail: "Practices held, attendance %, volume in meters, PBs, and flags raised per group." },
            { title: "Check the errors note if present", detail: "A failed group is listed there; the rest of the report is unaffected." },
            { title: "Select **Print** to share", detail: "" },
          ],
        },
      ],
    },
    {
      id: "h-seed",
      title: "Seed / reset demo data",
      icon: "Database",
      access: "coach",
      route: "/coach/data",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Run the seed from a terminal", detail: "See the commands below — they run against your Convex deployment." },
            { title: "Verify on **Data**", detail: "Table counts, demo account badges, and the per-swimmer coverage matrix confirm what was created." },
            { title: "Sign in as a demo student to explore", detail: "Demo passwords are shown on the Data page." },
          ],
        },
        {
          type: "code",
          title: "CLI",
          code: "npx convex run seed:seed        # seed 4 demo swimmers (refuses to run twice)\nnpx convex run seed:resetDemo   # remove demo accounts, groups & reports\nnpx convex run seed:status      # table counts + demo account report",
        },
        {
          type: "callout",
          tone: "warning",
          text: "`seed:resetDemo` also deletes **all weekly reports**. Manual students and the coach account are untouched.",
        },
      ],
    },
    {
      id: "h-student-profile",
      title: "Student: update your profile",
      icon: "User",
      access: "student",
      route: "/student/profile",
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Profile**", detail: "" },
            { title: "Edit your display name", detail: "1–100 characters." },
            { title: "Change your avatar", detail: "Upload an image (≤ 5 MB) or paste an image URL; remove it to go back to initials." },
            { title: "Select **Save Changes**", detail: "" },
          ],
        },
        {
          type: "p",
          text: "**Result:** your new name and photo appear everywhere immediately — in the sidebar, dashboards, and coach views. Email and password cannot be changed here; ask your coach.",
        },
      ],
    },
  ],
};
