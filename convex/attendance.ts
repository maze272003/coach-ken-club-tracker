import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { attendanceStats } from "./lib/stats";
import { assertDateString } from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const attendanceStatusValidator = v.union(
  v.literal("present"),
  v.literal("late"),
  v.literal("absent"),
);

const attendanceRecord = v.object({
  _id: v.id("attendance"),
  date: v.string(),
  status: v.union(
    v.literal("present"),
    v.literal("late"),
    v.literal("absent"),
  ),
});

/**
 * Coach-only: record or update attendance for a student on a date
 * (one record per student per date; re-recording edits in place).
 */
export const record = mutation({
  args: {
    studentId: v.id("students"),
    date: v.string(),
    status: attendanceStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");
    assertDateString(args.date);

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) =>
        q.eq("studentId", args.studentId).eq("date", args.date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("attendance", existing._id, {
        status: args.status,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("attendance", {
        studentId: args.studentId,
        date: args.date,
        status: args.status,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Coach or owning student: attendance history plus derived stats.
 * A student calling with someone else's studentId gets nothing.
 */
export const listForStudent = query({
  args: { studentId: v.id("students") },
  returns: v.object({
    stats: v.object({
      total: v.number(),
      attended: v.number(),
      present: v.number(),
      late: v.number(),
      absent: v.number(),
      percentage: v.union(v.number(), v.null()),
    }),
    records: v.array(attendanceRecord),
  }),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);

    const stats = await attendanceStats(ctx, studentId);
    const records = await ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(500);
    return {
      stats,
      records: records.map((r) => ({
        _id: r._id,
        date: r.date,
        status: r.status,
      })),
    };
  },
});

/**
 * Student-only: the signed-in student's own attendance history and
 * stats. No studentId argument — identity is resolved server-side.
 */
export const my = query({
  args: {},
  returns: v.object({
    stats: v.object({
      total: v.number(),
      attended: v.number(),
      present: v.number(),
      late: v.number(),
      absent: v.number(),
      percentage: v.union(v.number(), v.null()),
    }),
    records: v.array(attendanceRecord),
  }),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);

    const stats = await attendanceStats(ctx, self.student._id);
    const records = await ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) =>
        q.eq("studentId", self.student._id),
      )
      .order("desc")
      .take(500);
    return {
      stats,
      records: records.map((r) => ({
        _id: r._id,
        date: r.date,
        status: r.status,
      })),
    };
  },
});

/**
 * Coach-only: all active students with their attendance record for a
 * given date — the daily roll-call view.
 */
export const rollCall = query({
  args: { date: v.string() },
  returns: v.array(
    v.object({
      studentId: v.id("students"),
      name: v.string(),
      status: v.union(
        v.literal("present"),
        v.literal("late"),
        v.literal("absent"),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertDateString(args.date);

    const students = await ctx.db.query("students").take(500);
    const rows = await Promise.all(
      students.map(async (student) => {
        if (student.status !== "active") return null;
        const user = await ctx.db.get("users", student.userId);
        if (!user) return null;
        const record = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q.eq("studentId", student._id).eq("date", args.date),
          )
          .unique();
        return {
          studentId: student._id,
          name: user.name ?? "",
          status: record?.status ?? null,
        };
      }),
    );
    return rows.filter((r) => r !== null).sort((a, b) => a.name.localeCompare(b.name));
  },
});
