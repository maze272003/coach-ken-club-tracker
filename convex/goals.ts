import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { deriveGoalProgress } from "./lib/stats";
import {
  assertCourse,
  assertDateString,
  assertEventDistance,
  assertProgress,
  assertStroke,
  assertTimeMs,
} from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const goalStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("archived"),
);

const goalTypeValidator = v.union(
  v.literal("manual"),
  v.literal("time"),
  v.literal("attendance"),
);

const goalFields = {
  title: v.string(),
  description: v.optional(v.string()),
  type: v.optional(goalTypeValidator),
  distanceMeters: v.optional(v.number()),
  stroke: v.optional(v.string()),
  course: v.optional(v.union(v.literal("short"), v.literal("long"))),
  targetTimeMs: v.optional(v.number()),
  baselineBestMs: v.optional(v.number()),
  targetAttendancePct: v.optional(v.number()),
  target: v.optional(v.string()),
  progress: v.number(),
  status: goalStatusValidator,
  targetDate: v.optional(v.string()),
};

const goalRecord = v.object({
  _id: v.id("trainingGoals"),
  studentId: v.id("students"),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  type: v.union(goalTypeValidator, v.null()),
  distanceMeters: v.union(v.number(), v.null()),
  stroke: v.union(v.string(), v.null()),
  course: v.union(v.literal("short"), v.literal("long"), v.null()),
  targetTimeMs: v.union(v.number(), v.null()),
  baselineBestMs: v.union(v.number(), v.null()),
  targetAttendancePct: v.union(v.number(), v.null()),
  target: v.union(v.string(), v.null()),
  progress: v.number(),
  status: goalStatusValidator,
  targetDate: v.union(v.string(), v.null()),
  currentBestMs: v.union(v.number(), v.null()),
  currentAttendancePct: v.union(v.number(), v.null()),
  updatedAtMs: v.number(),
});

function validateGoalFields(args: {
  title: string;
  description?: string;
  type?: "manual" | "time" | "attendance";
  distanceMeters?: number;
  stroke?: string;
  course?: "short" | "long";
  targetTimeMs?: number;
  baselineBestMs?: number;
  targetAttendancePct?: number;
  target?: string;
  progress: number;
  targetDate?: string;
}) {
  const title = args.title.trim();
  if (title.length === 0 || title.length > 120) {
    throw new ConvexError("Title must be between 1 and 120 characters");
  }
  assertProgress(args.progress);
  if (args.description !== undefined && args.description.trim().length > 2000) {
    throw new ConvexError("Description must be at most 2000 characters");
  }
  if (args.target !== undefined && args.target.trim().length > 300) {
    throw new ConvexError("Target must be at most 300 characters");
  }
  if (args.targetDate !== undefined && args.targetDate.trim() !== "") {
    assertDateString(args.targetDate);
  }

  const type = args.type ?? "manual";
  if (type === "time") {
    if (args.distanceMeters === undefined) {
      throw new ConvexError("Distance is required for time goals");
    }
    assertEventDistance(args.distanceMeters);
    if (!args.stroke) {
      throw new ConvexError("Stroke is required for time goals");
    }
    assertStroke(args.stroke);
    if (!args.course) {
      throw new ConvexError("Course is required for time goals");
    }
    assertCourse(args.course);
    if (args.targetTimeMs === undefined) {
      throw new ConvexError("Target time is required for time goals");
    }
    assertTimeMs(args.targetTimeMs);
    if (args.baselineBestMs !== undefined) {
      assertTimeMs(args.baselineBestMs);
    }
  } else if (type === "attendance") {
    if (
      args.targetAttendancePct === undefined ||
      args.targetAttendancePct < 1 ||
      args.targetAttendancePct > 100
    ) {
      throw new ConvexError("Target attendance percentage must be between 1 and 100");
    }
  }

  return {
    title,
    description: args.description?.trim() || undefined,
    type,
    distanceMeters: args.distanceMeters,
    stroke: args.stroke,
    course: args.course,
    targetTimeMs: args.targetTimeMs,
    baselineBestMs: args.baselineBestMs,
    targetAttendancePct: args.targetAttendancePct,
    target: args.target?.trim() || undefined,
    progress: args.progress,
    targetDate: args.targetDate?.trim() || undefined,
  };
}

/**
 * Checks all active goals for a student and auto-completes any that have reached 100%.
 */
export async function checkAndAutoCompleteGoals(
  ctx: MutationCtx,
  studentId: Id<"students">,
): Promise<void> {
  const activeGoals = await ctx.db
    .query("trainingGoals")
    .withIndex("by_student_and_updated", (q) => q.eq("studentId", studentId))
    .take(100);

  for (const goal of activeGoals) {
    if (goal.status === "completed" || goal.status === "archived") continue;

    const derived = await deriveGoalProgress(ctx, goal);
    if (derived.status === "completed" || derived.progress >= 100) {
      await ctx.db.patch("trainingGoals", goal._id, {
        status: "completed",
        progress: 100,
        updatedAt: Date.now(),
      });
    }
  }
}

/**
 * Coach-only: create a training goal for a student.
 */
export const create = mutation({
  args: { studentId: v.id("students"), ...goalFields },
  returns: v.object({ goalId: v.id("trainingGoals") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");

    const fields = validateGoalFields(args);

    // Auto-capture baseline PB if time goal and baselineBestMs omitted
    if (
      fields.type === "time" &&
      fields.baselineBestMs === undefined &&
      fields.stroke &&
      fields.distanceMeters &&
      fields.course
    ) {
      const times = await ctx.db
        .query("timeResults")
        .withIndex("by_student_and_event", (q) =>
          q
            .eq("studentId", args.studentId)
            .eq("stroke", fields.stroke!)
            .eq("distanceMeters", fields.distanceMeters!)
            .eq("course", fields.course!),
        )
        .take(500);

      if (times.length > 0) {
        fields.baselineBestMs = Math.min(...times.map((t) => t.timeMs));
      }
    }

    const goalId = await ctx.db.insert("trainingGoals", {
      studentId: args.studentId,
      ...fields,
      status: args.status,
      updatedAt: Date.now(),
    });

    // Check if newly created goal is already completed
    await checkAndAutoCompleteGoals(ctx, args.studentId);

    return { goalId };
  },
});

/**
 * Coach-only: update a training goal.
 */
export const update = mutation({
  args: { goalId: v.id("trainingGoals"), ...goalFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const goal = await ctx.db.get("trainingGoals", args.goalId);
    if (!goal) throw new ConvexError("Goal not found");

    const fields = validateGoalFields(args);
    await ctx.db.patch("trainingGoals", args.goalId, {
      ...fields,
      status: args.status,
      updatedAt: Date.now(),
    });

    await checkAndAutoCompleteGoals(ctx, goal.studentId);
    return null;
  },
});

/**
 * Coach-only: remove or archive a training goal.
 */
export const remove = mutation({
  args: { goalId: v.id("trainingGoals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const goal = await ctx.db.get("trainingGoals", args.goalId);
    if (!goal) throw new ConvexError("Goal not found");
    await ctx.db.delete("trainingGoals", args.goalId);
    return null;
  },
});

/**
 * Coach or owning student: a student's goals with dynamically derived progress.
 */
export const listForStudent = query({
  args: { studentId: v.id("students") },
  returns: v.array(goalRecord),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);

    const goals = await ctx.db
      .query("trainingGoals")
      .withIndex("by_student_and_updated", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(200);

    return Promise.all(
      goals.map(async (g) => {
        const derived = await deriveGoalProgress(ctx, g);
        return {
          _id: g._id,
          studentId: g.studentId,
          title: g.title,
          description: g.description ?? null,
          type: g.type ?? "manual",
          distanceMeters: g.distanceMeters ?? null,
          stroke: g.stroke ?? null,
          course: g.course ?? null,
          targetTimeMs: g.targetTimeMs ?? null,
          baselineBestMs: g.baselineBestMs ?? null,
          targetAttendancePct: g.targetAttendancePct ?? null,
          target: g.target ?? null,
          progress: derived.progress,
          status: derived.status,
          targetDate: g.targetDate ?? null,
          currentBestMs: derived.currentBestMs,
          currentAttendancePct: derived.currentAttendancePct,
          updatedAtMs: g.updatedAt,
        };
      }),
    );
  },
});

/**
 * Student-only: the signed-in student's own goals with dynamic progress.
 */
export const my = query({
  args: {},
  returns: v.array(goalRecord),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);

    const goals = await ctx.db
      .query("trainingGoals")
      .withIndex("by_student_and_updated", (q) =>
        q.eq("studentId", self.student._id),
      )
      .order("desc")
      .take(200);

    return Promise.all(
      goals.map(async (g) => {
        const derived = await deriveGoalProgress(ctx, g);
        return {
          _id: g._id,
          studentId: g.studentId,
          title: g.title,
          description: g.description ?? null,
          type: g.type ?? "manual",
          distanceMeters: g.distanceMeters ?? null,
          stroke: g.stroke ?? null,
          course: g.course ?? null,
          targetTimeMs: g.targetTimeMs ?? null,
          baselineBestMs: g.baselineBestMs ?? null,
          targetAttendancePct: g.targetAttendancePct ?? null,
          target: g.target ?? null,
          progress: derived.progress,
          status: derived.status,
          targetDate: g.targetDate ?? null,
          currentBestMs: derived.currentBestMs,
          currentAttendancePct: derived.currentAttendancePct,
          updatedAtMs: g.updatedAt,
        };
      }),
    );
  },
});
