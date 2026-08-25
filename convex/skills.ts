import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { assertStroke } from "./lib/strokes";
import { assertProgress } from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

/**
 * Coach-only: create or update the progress record for one stroke.
 * One record per (student, stroke) — re-recording edits in place.
 */
export const setProgress = mutation({
  args: {
    studentId: v.id("students"),
    stroke: v.string(),
    progress: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");
    assertStroke(args.stroke);
    assertProgress(args.progress);

    const existing = await ctx.db
      .query("strokeSkills")
      .withIndex("by_student_and_stroke", (q) =>
        q.eq("studentId", args.studentId).eq("stroke", args.stroke),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("strokeSkills", existing._id, {
        progress: args.progress,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("strokeSkills", {
        studentId: args.studentId,
        stroke: args.stroke,
        progress: args.progress,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Coach or owning student: stroke skill progress for a student.
 */
export const listForStudent = query({
  args: { studentId: v.id("students") },
  returns: v.array(
    v.object({
      stroke: v.string(),
      progress: v.number(),
      updatedAtMs: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);

    const skills = await ctx.db
      .query("strokeSkills")
      .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
      .take(100);
    return skills.map((s) => ({
      stroke: s.stroke,
      progress: s.progress,
      updatedAtMs: s.updatedAt,
    }));
  },
});

/**
 * Student-only: the signed-in student's own stroke skills.
 */
export const my = query({
  args: {},
  returns: v.array(
    v.object({
      stroke: v.string(),
      progress: v.number(),
      updatedAtMs: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);

    const skills = await ctx.db
      .query("strokeSkills")
      .withIndex("by_student_and_stroke", (q) =>
        q.eq("studentId", self.student._id),
      )
      .take(100);
    return skills.map((s) => ({
      stroke: s.stroke,
      progress: s.progress,
      updatedAtMs: s.updatedAt,
    }));
  },
});
