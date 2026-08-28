import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { assertDateString, assertProgress } from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const goalStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("archived"),
);


const goalFields = {
  title: v.string(),
  description: v.optional(v.string()),
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
  target: v.union(v.string(), v.null()),
  progress: v.number(),
  status: goalStatusValidator,
  targetDate: v.union(v.string(), v.null()),
  updatedAtMs: v.number(),
});

function validateGoalFields(args: {
  title: string;
  description?: string;
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
  if (args.targetDate !== undefined) {
    assertDateString(args.targetDate);
  }
  return {
    title,
    description: args.description?.trim() || undefined,
    target: args.target?.trim() || undefined,
    progress: args.progress,
    targetDate: args.targetDate,
  };
}

/**
 * Coach-only: create a training goal for a student.
 * Documented behavior: a goal that reaches progress 100 is
 * automatically treated as completed.
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
    const status =
      args.progress >= 100 ? ("completed" as const) : args.status;
    const goalId = await ctx.db.insert("trainingGoals", {
      studentId: args.studentId,
      ...fields,
      status,
      updatedAt: Date.now(),
    });
    return { goalId };
  },
});

/**
 * Coach-only: update a training goal. Progress reaching 100
 * auto-completes the goal.
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
    const status =
      args.progress >= 100 ? ("completed" as const) : args.status;
    await ctx.db.patch("trainingGoals", args.goalId, {
      ...fields,
      status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach or owning student: a student's goals, most recently
 * updated first.
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
    return goals.map((g) => ({
      _id: g._id,
      studentId: g.studentId,
      title: g.title,
      description: g.description ?? null,
      target: g.target ?? null,
      progress: g.progress,
      status: g.status,
      targetDate: g.targetDate ?? null,
      updatedAtMs: g.updatedAt,
    }));
  },
});

/**
 * Student-only: the signed-in student's own goals.
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
    return goals.map((g) => ({
      _id: g._id,
      studentId: g.studentId,
      title: g.title,
      description: g.description ?? null,
      target: g.target ?? null,
      progress: g.progress,
      status: g.status,
      targetDate: g.targetDate ?? null,
      updatedAtMs: g.updatedAt,
    }));
  },
});
