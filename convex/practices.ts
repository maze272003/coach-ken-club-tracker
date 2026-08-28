import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { assertExistingSkillKeys } from "./skills";
import {
  assertDateString,
  assertDistanceMeters,
  assertDuration,
  assertTimeString,
} from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const practiceStatusValidator = v.union(
  v.literal("planned"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const practiceRecord = v.object({
  _id: v.id("practices"),
  groupId: v.id("groups"),
  groupName: v.string(),
  date: v.string(),
  startTime: v.union(v.string(), v.null()),
  title: v.string(),
  plannedDurationMinutes: v.number(),
  plannedDistanceMeters: v.union(v.number(), v.null()),
  strokes: v.array(v.string()),
  notes: v.union(v.string(), v.null()),
  status: practiceStatusValidator,
  completedAt: v.union(v.number(), v.null()),
  actualDurationMinutes: v.union(v.number(), v.null()),
  actualDistanceMeters: v.union(v.number(), v.null()),
});

type PracticeDoc = Doc<"practices">;

function validatePracticeFields(args: {
  date: string;
  startTime?: string;
  title: string;
  plannedDurationMinutes: number;
  plannedDistanceMeters?: number;
  strokes: string[];
  notes?: string;
}) {
  assertDateString(args.date);
  if (args.startTime !== undefined) assertTimeString(args.startTime);
  const title = args.title.trim();
  if (title.length === 0 || title.length > 120) {
    throw new ConvexError("Title must be between 1 and 120 characters");
  }
  assertDuration(args.plannedDurationMinutes);
  if (args.plannedDistanceMeters !== undefined) {
    assertDistanceMeters(args.plannedDistanceMeters);
  }
  const strokes = [...new Set(args.strokes)];
  if (strokes.length === 0) {
    throw new ConvexError("Select at least one skill");
  }
  if (args.notes !== undefined && args.notes.trim().length > 5000) {
    throw new ConvexError("Notes must be at most 5000 characters");
  }
  return {
    date: args.date,
    startTime: args.startTime,
    title,
    plannedDurationMinutes: args.plannedDurationMinutes,
    plannedDistanceMeters: args.plannedDistanceMeters,
    strokes,
    notes: args.notes?.trim() || undefined,
  };
}

async function requireActiveGroup(
  ctx: QueryCtx,
  groupId: Id<"groups">,
): Promise<Doc<"groups">> {
  const group = await ctx.db.get("groups", groupId);
  if (!group || group.status !== "active") {
    throw new ConvexError("Group not found");
  }
  return group;
}

async function toRecord(ctx: QueryCtx, practice: PracticeDoc) {
  const group = await ctx.db.get("groups", practice.groupId);
  return {
    _id: practice._id,
    groupId: practice.groupId,
    groupName: group?.name ?? "Unknown",
    date: practice.date,
    startTime: practice.startTime ?? null,
    title: practice.title,
    plannedDurationMinutes: practice.plannedDurationMinutes,
    plannedDistanceMeters: practice.plannedDistanceMeters ?? null,
    strokes: practice.strokes,
    notes: practice.notes ?? null,
    status: practice.status,
    completedAt: practice.completedAt ?? null,
    actualDurationMinutes: practice.actualDurationMinutes ?? null,
    actualDistanceMeters: practice.actualDistanceMeters ?? null,
  };
}

/**
 * Coach-only: schedule a practice for a group.
 */
export const create = mutation({
  args: {
    groupId: v.id("groups"),
    date: v.string(),
    startTime: v.optional(v.string()),
    title: v.string(),
    plannedDurationMinutes: v.number(),
    plannedDistanceMeters: v.optional(v.number()),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({ practiceId: v.id("practices") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    await requireActiveGroup(ctx, args.groupId);
    const fields = validatePracticeFields(args);
    await assertExistingSkillKeys(ctx, fields.strokes);
    const practiceId = await ctx.db.insert("practices", {
      groupId: args.groupId,
      ...fields,
      status: "planned",
      updatedAt: Date.now(),
    });
    return { practiceId };
  },
});

/**
 * Coach-only: edit a practice. Full-field update; only possible
 * while still planned. Group is immutable — recreate instead.
 */
export const update = mutation({
  args: {
    practiceId: v.id("practices"),
    groupId: v.id("groups"),
    date: v.string(),
    startTime: v.optional(v.string()),
    title: v.string(),
    plannedDurationMinutes: v.number(),
    plannedDistanceMeters: v.optional(v.number()),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const practice = await ctx.db.get("practices", args.practiceId);
    if (!practice) throw new ConvexError("Practice not found");
    if (practice.status !== "planned") {
      throw new ConvexError("Only planned practices can be edited");
    }
    if (practice.groupId !== args.groupId) {
      throw new ConvexError("Group cannot be changed; recreate the practice");
    }
    const fields = validatePracticeFields(args);
    await assertExistingSkillKeys(ctx, fields.strokes);
    await ctx.db.patch("practices", args.practiceId, {
      ...fields,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: cancel a planned practice.
 */
export const cancel = mutation({
  args: { practiceId: v.id("practices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const practice = await ctx.db.get("practices", args.practiceId);
    if (!practice) throw new ConvexError("Practice not found");
    if (practice.status !== "planned") {
      throw new ConvexError("Only planned practices can be cancelled");
    }
    await ctx.db.patch("practices", args.practiceId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: a group's practices in a date range (defaults to all),
 * newest first, cap 200.
 */
export const listForGroup = query({
  args: {
    groupId: v.id("groups"),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  returns: v.array(practiceRecord),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    if (args.fromDate !== undefined) assertDateString(args.fromDate);
    if (args.toDate !== undefined) assertDateString(args.toDate);

    const practices = await ctx.db
      .query("practices")
      .withIndex("by_group_and_date", (q) =>
        q
          .eq("groupId", args.groupId)
          .gte("date", args.fromDate ?? "")
          .lte("date", args.toDate ?? "9999-99-99"),
      )
      .order("desc")
      .take(200);

    return Promise.all(practices.map((practice) => toRecord(ctx, practice)));
  },
});

/**
 * Coach-only: upcoming (or same-day) planned practices across all
 * groups, oldest first. `fromDate` is passed by the client —
 * queries never read the wall clock.
 */
export const listUpcoming = query({
  args: { fromDate: v.string() },
  returns: v.array(practiceRecord),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertDateString(args.fromDate);
    const practices = await ctx.db
      .query("practices")
      .withIndex("by_date", (q) => q.gte("date", args.fromDate))
      .order("asc")
      .take(100);
    const planned = practices.filter((p) => p.status === "planned");
    return Promise.all(planned.map((practice) => toRecord(ctx, practice)));
  },
});

/**
 * Coach-only: mark a practice completed and fan out one training
 * session per active group member (idempotent — keyed by
 * (studentId, practiceId)). Members recorded absent on the practice
 * date are skipped; members with present/late or no attendance
 * record get a session. Re-running updates actuals and patches
 * existing fan-out sessions.
 */
export const complete = mutation({
  args: {
    practiceId: v.id("practices"),
    actualDurationMinutes: v.optional(v.number()),
    actualDistanceMeters: v.optional(v.number()),
  },
  returns: v.object({
    sessionsCreated: v.number(),
    sessionsUpdated: v.number(),
    sessionsSkipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const practice = await ctx.db.get("practices", args.practiceId);
    if (!practice) throw new ConvexError("Practice not found");
    if (practice.status === "cancelled") {
      throw new ConvexError("Cannot complete a cancelled practice");
    }
    const actualDuration =
      args.actualDurationMinutes ?? practice.plannedDurationMinutes;
    assertDuration(actualDuration);
    const actualDistance =
      args.actualDistanceMeters ?? practice.plannedDistanceMeters;
    if (actualDistance !== undefined) assertDistanceMeters(actualDistance);

    const members = await ctx.db
      .query("students")
      .withIndex("by_group", (q) => q.eq("groupId", practice.groupId))
      .take(500);

    let sessionsCreated = 0;
    let sessionsUpdated = 0;
    let sessionsSkipped = 0;

    for (const member of members) {
      if (member.status !== "active") {
        sessionsSkipped += 1;
        continue;
      }
      const existing = await ctx.db
        .query("trainingSessions")
        .withIndex("by_student_and_practice", (q) =>
          q.eq("studentId", member._id).eq("practiceId", practice._id),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("trainingSessions", existing._id, {
          date: practice.date,
          title: practice.title,
          durationMinutes: actualDuration,
          ...(actualDistance !== undefined ? { distanceMeters: actualDistance } : {}),
          strokes: practice.strokes,
          updatedAt: Date.now(),
        });
        sessionsUpdated += 1;
        continue;
      }
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", member._id).eq("date", practice.date),
        )
        .unique();
      if (attendance?.status === "absent") {
        sessionsSkipped += 1;
        continue;
      }
      await ctx.db.insert("trainingSessions", {
        studentId: member._id,
        practiceId: practice._id,
        date: practice.date,
        title: practice.title,
        durationMinutes: actualDuration,
        ...(actualDistance !== undefined ? { distanceMeters: actualDistance } : {}),
        strokes: practice.strokes,
        notes: `From practice: ${practice.notes ?? ""}`.slice(0, 2000),
        updatedAt: Date.now(),
      });
      sessionsCreated += 1;
    }

    await ctx.db.patch("practices", practice._id, {
      status: "completed",
      completedAt: practice.completedAt ?? Date.now(),
      actualDurationMinutes: actualDuration,
      ...(actualDistance !== undefined ? { actualDistanceMeters: actualDistance } : {}),
      updatedAt: Date.now(),
    });
    return { sessionsCreated, sessionsUpdated, sessionsSkipped };
  },
});
