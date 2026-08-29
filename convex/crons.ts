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

export default crons;
