import type { DocSection } from "../types";

export const errorsSection: DocSection = {
  id: "errors",
  title: "Errors & Edge Cases",
  icon: "TriangleAlert",
  summary:
    "Validation rules, common errors, what causes them, and what to do about it.",
  subsections: [
    {
      id: "e-auth",
      title: "Sign-in Problems",
      icon: "Lock",
      blocks: [
        {
          type: "table",
          headers: ["Message / symptom", "Cause", "What to do"],
          rows: [
            [
              "“Invalid email or password”",
              "Wrong credentials — coach email/password don’t match the server configuration, or the student password is incorrect.",
              "Double-check for typos. Students: ask the coach for a reset. Coach: verify the deployment’s environment variables.",
            ],
            [
              "“This account has been deactivated. Contact your coach.”",
              "The coach set the student’s status to inactive.",
              "Ask the coach to reactivate the account from the student profile.",
            ],
            [
              "“Your session has expired” toast",
              "The JWT session ran out (or the coach reset your password).",
              "Sign in again.",
            ],
            [
              "“You’re doing that too fast” toast",
              "Too many attempts in a short window (rate limiting).",
              "Wait a moment and try again.",
            ],
          ],
        },
      ],
    },
    {
      id: "e-validation",
      title: "Common Validation Errors",
      icon: "TriangleAlert",
      blocks: [
        {
          type: "table",
          headers: ["Error", "Trigger", "Fix"],
          rows: [
            ["“A user with this email already exists”", "Creating a student with an email that’s taken.", "Use a different email — emails are permanent per account."],
            ["“An active group with this name already exists”", "Duplicate group name among active groups (case-insensitive).", "Rename one of the groups or archive the old one first."],
            ["“A skill named … already exists”", "Adding a skill whose name matches an active skill.", "Rename it; if an archived skill with the same key exists, adding restores it instead."],
            ["“Progress must be a whole number between 0 and 100”", "Skill progress like 55.5 or 120.", "Enter a whole number 0–100."],
            ["“Duration must be a positive number of minutes”", "Duration outside 1–1440.", "Enter minutes between 1 and 1440 (24 h)."],
            ["“Distance must be between 1 and 30000 meters”", "Distance out of range.", "Correct the distance."],
            ["“Time must be between 0.01s and 60 minutes”", "Parsed swim time out of range.", "Check for a typo, e.g. missing decimal point."],
            ["“Invalid distance. Must be one of: 25, 50, 100, 200, 400, 800, 1500m”", "Non-standard event distance for times.", "Pick a standard race distance."],
            ["“Target attendance percentage must be between 1 and 100”", "Attendance goal target out of range.", "Set 1–100%."],
            ["“startDate must be before or equal to endDate”", "Custom date range in exports with the bounds reversed.", "Swap the dates."],
            ["“At most 200 entries per roll call” / “…per batch”", "Bulk save larger than 200 swimmers/entries.", "Split by group — roll call saves per group anyway."],
          ],
        },
      ],
    },
    {
      id: "e-lifecycle",
      title: "Lifecycle & Not-found Errors",
      icon: "CircleX",
      blocks: [
        {
          type: "table",
          headers: ["Error", "Trigger", "Expected behavior"],
          rows: [
            ["“Only planned practices can be edited / cancelled”", "Editing or cancelling a completed practice.", "Completed practices are history — schedule a new one instead."],
            ["“Cannot complete a cancelled practice”", "Completing a cancelled practice.", "Recreate the practice if it actually happened."],
            ["“Group cannot be changed; recreate the practice”", "Moving a practice to another group.", "By design: sessions fan out to the practice’s group."],
            ["“Unknown skill: …” / “Unknown or archived skill: …”", "Referencing a skill key that was deleted from the catalog (or setting progress on an archived skill).", "Restore the skill in the library, or choose an active one."],
            ["“Student not found”, “Group not found”, “Goal not found”, “Time result not found”", "Operating on a record that was removed in another tab/device.", "Refresh — the lists update live, so stale rows disappear automatically."],
          ],
        },
      ],
    },
    {
      id: "e-behaviors",
      title: "Edge Cases & Expected Behavior",
      icon: "Info",
      blocks: [
        {
          type: "bullets",
          items: [
            "**Absent swimmers get no session** when a practice completes — that is intentional; mark them present/late before completing if they trained.",
            "**“no progress recorded yet”** instead of `0%` — a swimmer with no skill records shows an explicit empty state, never a misleading zero.",
            "**Attendance vs commitment** — attendance % counts all roll-call records ever; commitment % counts only completed group practices since the swimmer joined. They can legitimately differ.",
            "**First result for an event is a PB** — there is nothing to beat, so it counts and is celebrated.",
            "**Export PB flags are scoped to the export** — if you export a date range, PB badges are computed within that range.",
            "**Weekly report errors note** — if one group failed to aggregate, the report still generates and lists the failed group; check the group’s data (e.g. invalid records) and wait for the next weekly run.",
            "**Time-trial drafts are per browser** — the autosaved sheet restores only on the same device/browser with the same trial setup.",
            "**Empty states everywhere** — screens explain themselves when there is no data yet (e.g. “no practices scheduled” with a shortcut to schedule one).",
          ],
        },
      ],
    },
  ],
};
