import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { attendanceStats } from "./lib/stats";
import { assertDateString, assertMonthString } from "./lib/validation";

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
 * Coach-only: record or update roll call for many students on one
 * date in a single transaction. One record per student per date
 * (upsert, duplicates last-wins), max 200 entries.
 */
export const recordBulk = mutation({
  args: {
    date: v.string(),
    entries: v.array(
      v.object({
        studentId: v.id("students"),
        status: attendanceStatusValidator,
      }),
    ),
  },
  returns: v.object({ recorded: v.number() }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertDateString(args.date);
    if (args.entries.length === 0) {
      throw new ConvexError("At least one entry is required");
    }
    if (args.entries.length > 200) {
      throw new ConvexError("At most 200 entries per roll call");
    }

    const byStudent = new Map(
      args.entries.map((entry) => [entry.studentId, entry.status]),
    );
    let recorded = 0;
    for (const [studentId, status] of byStudent) {
      const student = await ctx.db.get("students", studentId);
      if (!student) throw new ConvexError("Student not found");
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", studentId).eq("date", args.date),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("attendance", existing._id, {
          status,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("attendance", {
          studentId,
          date: args.date,
          status,
          updatedAt: Date.now(),
        });
      }
      recorded += 1;
    }
    return { recorded };
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
 * Coach-only: per-day attendance counts for a whole month ("YYYY-MM"),
 * so the calendar can badge days that already have roll call recorded.
 */
export const monthSummary = query({
  args: { month: v.string() },
  returns: v.record(
    v.string(),
    v.object({
      present: v.number(),
      late: v.number(),
      absent: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertMonthString(args.month);

    const [year, month] = args.month.split("-").map(Number);
    const nextMonth =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_date", (q) =>
        q.gte("date", `${args.month}-01`).lt("date", nextMonth),
      )
      .take(2000);

    const summary: Record<
      string,
      { present: number; late: number; absent: number }
    > = {};
    for (const row of rows) {
      const entry = (summary[row.date] ??= {
        present: 0,
        late: 0,
        absent: 0,
      });
      entry[row.status] += 1;
    }
    return summary;
  },
});

/**
 * Coach-only: all active students with their attendance record for a
 * given date — the daily roll-call view.
 */
export const rollCall = query({
  args: {
    date: v.string(),
    groupId: v.optional(v.union(v.id("groups"), v.null())),
  },
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
        if (args.groupId !== undefined) {
          if (args.groupId === null) {
            if (student.groupId !== undefined) return null;
          } else if (student.groupId !== args.groupId) {
            return null;
          }
        }
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

/**
 * Export attendance records: customizable by student (all students or a
 * specific student), date range (startDate/endDate), and status.
 * Returns enriched records with student name and email, along with derived stats.
 */
export const exportAttendance = query({
  args: {
    studentId: v.optional(v.id("students")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(attendanceStatusValidator),
  },
  returns: v.object({
    stats: v.object({
      total: v.number(),
      attended: v.number(),
      present: v.number(),
      late: v.number(),
      absent: v.number(),
      percentage: v.union(v.number(), v.null()),
    }),
    records: v.array(
      v.object({
        _id: v.id("attendance"),
        studentId: v.id("students"),
        studentName: v.string(),
        studentEmail: v.string(),
        date: v.string(),
        status: attendanceStatusValidator,
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    const student = coach ? null : await requireStudent(ctx);
    if (!coach && !student) throw new ConvexError(NOT_AUTHORIZED);

    // If caller is student, force scope to their own studentId
    const targetStudentId = coach ? args.studentId : student?.student._id;

    if (args.startDate !== undefined) assertDateString(args.startDate);
    if (args.endDate !== undefined) assertDateString(args.endDate);
    if (
      args.startDate !== undefined &&
      args.endDate !== undefined &&
      args.startDate > args.endDate
    ) {
      throw new ConvexError("startDate must be before or equal to endDate");
    }

    let records;
    if (targetStudentId !== undefined) {
      if (args.startDate !== undefined && args.endDate !== undefined) {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q
              .eq("studentId", targetStudentId)
              .gte("date", args.startDate!)
              .lte("date", args.endDate!),
          )
          .order("desc")
          .take(5000);
      } else if (args.startDate !== undefined) {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q.eq("studentId", targetStudentId).gte("date", args.startDate!),
          )
          .order("desc")
          .take(5000);
      } else if (args.endDate !== undefined) {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q.eq("studentId", targetStudentId).lte("date", args.endDate!),
          )
          .order("desc")
          .take(5000);
      } else {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q.eq("studentId", targetStudentId),
          )
          .order("desc")
          .take(5000);
      }
    } else {
      // All students (coach only)
      if (args.startDate !== undefined && args.endDate !== undefined) {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_date", (q) =>
            q.gte("date", args.startDate!).lte("date", args.endDate!),
          )
          .order("desc")
          .take(5000);
      } else if (args.startDate !== undefined) {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_date", (q) => q.gte("date", args.startDate!))
          .order("desc")
          .take(5000);
      } else if (args.endDate !== undefined) {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_date", (q) => q.lte("date", args.endDate!))
          .order("desc")
          .take(5000);
      } else {
        records = await ctx.db
          .query("attendance")
          .withIndex("by_date")
          .order("desc")
          .take(5000);
      }
    }

    if (args.status !== undefined) {
      records = records.filter((r) => r.status === args.status);
    }

    // Hydrate student and user info
    const uniqueStudentIds = Array.from(
      new Set(records.map((r) => r.studentId)),
    );
    const studentMap = new Map<string, { name: string; email: string }>();

    await Promise.all(
      uniqueStudentIds.map(async (sId) => {
        const studentDoc = await ctx.db.get("students", sId);
        if (!studentDoc) return;
        const userDoc = await ctx.db.get("users", studentDoc.userId);
        studentMap.set(sId, {
          name: userDoc?.name ?? "Unknown Student",
          email: userDoc?.email ?? "",
        });
      }),
    );

    const formattedRecords = records
      .map((r) => {
        const studentInfo = studentMap.get(r.studentId);
        return {
          _id: r._id,
          studentId: r.studentId,
          studentName: studentInfo?.name ?? "Unknown Student",
          studentEmail: studentInfo?.email ?? "",
          date: r.date,
          status: r.status,
          updatedAt: r.updatedAt,
        };
      })
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return a.studentName.localeCompare(b.studentName);
      });

    const total = formattedRecords.length;
    const present = formattedRecords.filter((r) => r.status === "present").length;
    const late = formattedRecords.filter((r) => r.status === "late").length;
    const absent = formattedRecords.filter((r) => r.status === "absent").length;
    const attended = present + late;
    const percentage =
      total === 0 ? null : Math.round((attended / total) * 100);

    return {
      stats: {
        total,
        attended,
        present,
        late,
        absent,
        percentage,
      },
      records: formattedRecords,
    };
  },
});

