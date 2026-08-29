// convex/parentEmails.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireCoach } from "./lib/access";
import { buildAthleteCard } from "./lib/reportCard";
import type { ReportEmailPayload } from "./lib/reportEmail";
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";

const NOT_AUTHORIZED = "Not authorized";

export const BATCH_SIZE = 5;
export const DRIP_INTERVAL_MS = 2 * 60 * 1000;
export const RETRY_BACKOFF_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const DAILY_SEND_CAP = 400;

/** weekStart of the most recently completed week (Mon-Sun, coach TZ). */
function lastCompletedWeekStart(): string {
  return weekStartIso(datePlusDays(todayInCoachTz(), -1));
}

function startOfUtcDay(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

type EnqueueSummary = {
  enqueued: number;
  errors: { student: string; error: string }[];
};

/**
 * Snapshots the full report card for every active student with a
 * parent email into a pending queue row. Idempotent per
 * (weekStart, studentId) via the unique index.
 */
async function enqueueEligible(
  ctx: MutationCtx,
  weekStart: string,
): Promise<EnqueueSummary> {
  const students = await ctx.db.query("students").take(1000);
  const eligible = students.filter(
    (s) => s.status === "active" && !!s.parentEmail,
  );
  let enqueued = 0;
  const errors: { student: string; error: string }[] = [];
  for (const student of eligible) {
    try {
      const existing = await ctx.db
        .query("parentEmails")
        .withIndex("by_week_and_student", (q) =>
          q.eq("weekStart", weekStart).eq("studentId", student._id),
        )
        .unique();
      if (existing) continue;
      const card = await buildAthleteCard(ctx, student, todayInCoachTz());
      const payload: ReportEmailPayload = { weekStart, card };
      const accessToken = crypto.randomUUID();
      await ctx.db.insert("parentEmails", {
        studentId: student._id,
        weekStart,
        toEmail: student.parentEmail!,
        payloadJson: JSON.stringify(payload),
        accessToken,
        status: "pending",
        attempts: 0,
        dueAt: Date.now(),
        createdAt: Date.now(),
      });
      enqueued += 1;
    } catch (err) {
      errors.push({
        student: student._id,
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }
  return { enqueued, errors };
}

/** Cron entry (Mon 06:05 Manila): enqueue the week, kick the dripper. */
export const enqueueWeekly = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const weekStart = lastCompletedWeekStart();
    await enqueueEligible(ctx, weekStart);
    await ctx.scheduler.runAfter(0, internal.parentEmailsActions.processBatch, {});
    return null;
  },
});

/**
 * Claims up to BATCH_SIZE due pending rows, bumping dueAt by the drip
 * interval so a crashed processor never strands rows in-flight.
 * Respects the daily send cap.
 */
export const claimBatch = internalMutation({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("parentEmails"),
      toEmail: v.string(),
      payloadJson: v.string(),
      accessToken: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const sentToday = await ctx.db
      .query("parentEmails")
      .withIndex("by_sentAt", (q) => q.gte("sentAt", startOfUtcDay()))
      .take(DAILY_SEND_CAP);
    const remaining = DAILY_SEND_CAP - sentToday.length;
    if (remaining <= 0) return [];
    const due = await ctx.db
      .query("parentEmails")
      .withIndex("by_status_and_due", (q) =>
        q.eq("status", "pending").lte("dueAt", Date.now()),
      )
      .take(Math.min(BATCH_SIZE, remaining));
    const now = Date.now();
    for (const row of due) {
      await ctx.db.patch("parentEmails", row._id, { dueAt: now + DRIP_INTERVAL_MS });
    }
    return due.map((r) => ({
      _id: r._id,
      toEmail: r.toEmail,
      payloadJson: r.payloadJson,
      accessToken: r.accessToken,
    }));
  },
});

/**
 * Records per-row send outcomes. Failures stay pending with 30-minute
 * backoff until MAX_ATTEMPTS, then become permanent failures.
 */
export const recordResults = internalMutation({
  args: {
    results: v.array(
      v.union(
        v.object({ id: v.id("parentEmails"), ok: v.literal(true) }),
        v.object({
          id: v.id("parentEmails"),
          ok: v.literal(false),
          error: v.string(),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    for (const result of results) {
      const row = await ctx.db.get("parentEmails", result.id);
      if (!row || row.status !== "pending") continue;
      if (result.ok) {
        await ctx.db.patch("parentEmails", row._id, { status: "sent", sentAt: Date.now() });
      } else {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await ctx.db.patch("parentEmails", row._id, {
            status: "failed",
            attempts,
            lastError: result.error,
          });
        } else {
          await ctx.db.patch("parentEmails", row._id, {
            attempts,
            lastError: result.error,
            dueAt: Date.now() + RETRY_BACKOFF_MS,
          });
        }
      }
    }
    return null;
  },
});

/** True when any pending rows exist (drives the reschedule decision). */
export const hasPending = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("parentEmails")
      .withIndex("by_status_and_due", (q) => q.eq("status", "pending"))
      .first();
    return row !== null;
  },
});

/**
 * Safety drain (every 15 min): kicks processBatch if anything is
 * pending. Recovers from a crashed processor and drives backoff
 * retries. Cheap no-op when the queue is empty.
 */
export const kickIfPending = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("parentEmails")
      .withIndex("by_status_and_due", (q) => q.eq("status", "pending"))
      .first();
    if (row) {
      await ctx.scheduler.runAfter(0, internal.parentEmailsActions.processBatch, {});
    }
    return null;
  },
});

/** Coach-only: enqueue any missing students for the completed week and send now. */
export const triggerNow = mutation({
  args: {},
  returns: v.object({
    weekStart: v.string(),
    enqueued: v.number(),
    errors: v.array(
      v.object({ student: v.string(), error: v.string() }),
    ),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const weekStart = lastCompletedWeekStart();
    const summary = await enqueueEligible(ctx, weekStart);
    await ctx.scheduler.runAfter(0, internal.parentEmailsActions.processBatch, {});
    return { weekStart, ...summary };
  },
});

/** Coach-only: this week's queue counts for the reports page strip. */
export const weekStatus = query({
  args: {},
  returns: v.object({
    weekStart: v.string(),
    pending: v.number(),
    sent: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const weekStart = lastCompletedWeekStart();
    const rows = await ctx.db
      .query("parentEmails")
      .withIndex("by_week_and_student", (q) => q.eq("weekStart", weekStart))
      .collect();
    return {
      weekStart,
      pending: rows.filter((r) => r.status === "pending").length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
  },
});

/** Public query to load report card by secure token for parent portal web view. */
export const getByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      weekStart: v.string(),
      payloadJson: v.string(),
    }),
  ),
  handler: async (ctx, { token }) => {
    if (!token) return null;
    const row = await ctx.db
      .query("parentEmails")
      .withIndex("by_token", (q) => q.eq("accessToken", token))
      .unique();
    if (!row) return null;
    return {
      weekStart: row.weekStart,
      payloadJson: row.payloadJson,
    };
  },
});
