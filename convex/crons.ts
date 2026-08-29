/* eslint-disable @convex-dev/no-top-of-hour-crons */
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Monday 06:00 Asia/Manila == Sunday 22:00 UTC ("0 22 * * 0").
crons.cron(
  "weekly-report",
  "0 22 * * 0",
  internal.reports.generateWeekly,
  {},
);

// Monday 06:05 Asia/Manila == Sunday 22:05 UTC: snapshot cards and
// enqueue parent emails for the completed week.
crons.cron(
  "parent-email-enqueue",
  "5 22 * * 0",
  internal.parentEmails.enqueueWeekly,
  {},
);

// Safety drain at :07/:22/:37/:52 (avoids top of hour): recovers a
// crashed sender and drives 30-minute retry backoff.
crons.cron(
  "parent-email-drain",
  "7-59/15 * * * *",
  internal.parentEmails.kickIfPending,
  {},
);

export default crons;
