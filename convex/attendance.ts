import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { attendanceStats } from "./lib/stats";
import { assertDateString, assertMonthString } from "./lib/validation";
import { checkAndAutoCompleteGoals } from "./goals";
import { formatTimeMs } from "../lib/format";
import { formatEventName } from "./times";



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
    await checkAndAutoCompleteGoals(ctx, args.studentId);
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
      await checkAndAutoCompleteGoals(ctx, studentId);
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
 * Filterable attendance query for CSV export and data compaction.
 * Compacts daily training sessions, strokes practiced, split times, and
 * personal best achievements into each attendance date record.
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
      totalTrainingMinutes: v.number(),
      totalDistanceMeters: v.number(),
      totalTimesRecorded: v.number(),
      totalPBsAchieved: v.number(),
    }),
    records: v.array(
      v.object({
        _id: v.id("attendance"),
        studentId: v.id("students"),
        studentName: v.string(),
        studentEmail: v.string(),
        groupName: v.union(v.string(), v.null()),
        date: v.string(),
        status: attendanceStatusValidator,
        // Connected daily training data
        sessionsCount: v.number(),
        trainingSummary: v.string(),
        totalTrainingMinutes: v.number(),
        totalDistanceMeters: v.number(),
        strokesPracticed: v.array(v.string()),
        sessionNotes: v.union(v.string(), v.null()),
        // Connected daily time trial and PB data
        timesCount: v.number(),
        timesSummary: v.string(),
        personalBestsAchieved: v.array(v.string()),
        timeNotes: v.union(v.string(), v.null()),
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

    // Hydrate student, user, group, training sessions, and time trial results
    const uniqueStudentIds = Array.from(
      new Set(records.map((r) => r.studentId)),
    );

    const studentMetaMap = new Map<
      string,
      {
        name: string;
        email: string;
        groupName: string | null;
        sessionsByDate: Map<
          string,
          {
            title: string;
            durationMinutes: number;
            distanceMeters: number | null;
            strokes: string[];
            notes: string | null;
          }[]
        >;
        timesByDate: Map<
          string,
          {
            distanceMeters: number;
            stroke: string;
            course: "short" | "long";
            timeMs: number;
            context: string;
            notes: string | null;
          }[]
        >;
        bestByEvent: Map<string, number>;
      }
    >();

    await Promise.all(
      uniqueStudentIds.map(async (sId) => {
        const studentDoc = await ctx.db.get("students", sId);
        if (!studentDoc) return;
        const userDoc = await ctx.db.get("users", studentDoc.userId);
        let groupName: string | null = null;
        if (studentDoc.groupId) {
          const groupDoc = await ctx.db.get("groups", studentDoc.groupId);
          groupName = groupDoc?.name ?? null;
        }

        // Fetch all training sessions for this student
        const studentSessions = await ctx.db
          .query("trainingSessions")
          .withIndex("by_student_and_date", (q) => q.eq("studentId", sId))
          .take(2000);

        const sessionsByDate = new Map<
          string,
          {
            title: string;
            durationMinutes: number;
            distanceMeters: number | null;
            strokes: string[];
            notes: string | null;
          }[]
        >();
        for (const s of studentSessions) {
          const list = sessionsByDate.get(s.date) ?? [];
          list.push({
            title: s.title,
            durationMinutes: s.durationMinutes,
            distanceMeters: s.distanceMeters ?? null,
            strokes: s.strokes,
            notes: s.notes ?? null,
          });
          sessionsByDate.set(s.date, list);
        }

        // Fetch all time results for this student
        const studentTimes = await ctx.db
          .query("timeResults")
          .withIndex("by_student_and_date", (q) => q.eq("studentId", sId))
          .take(2000);

        const bestByEvent = new Map<string, number>();
        const timesByDate = new Map<
          string,
          {
            distanceMeters: number;
            stroke: string;
            course: "short" | "long";
            timeMs: number;
            context: string;
            notes: string | null;
          }[]
        >();

        for (const t of studentTimes) {
          const eventKey = `${t.stroke}-${t.distanceMeters}-${t.course}`;
          const currentBest = bestByEvent.get(eventKey);
          if (currentBest === undefined || t.timeMs < currentBest) {
            bestByEvent.set(eventKey, t.timeMs);
          }

          const list = timesByDate.get(t.date) ?? [];
          list.push({
            distanceMeters: t.distanceMeters,
            stroke: t.stroke,
            course: t.course,
            timeMs: t.timeMs,
            context: t.context,
            notes: t.notes ?? null,
          });
          timesByDate.set(t.date, list);
        }

        studentMetaMap.set(sId, {
          name: userDoc?.name ?? "Unknown Student",
          email: userDoc?.email ?? "",
          groupName,
          sessionsByDate,
          timesByDate,
          bestByEvent,
        });
      }),
    );

    let totalTrainingMinutes = 0;
    let totalDistanceMeters = 0;
    let totalTimesRecorded = 0;
    let totalPBsAchieved = 0;

    const formattedRecords = records
      .map((r) => {
        const studentMeta = studentMetaMap.get(r.studentId);
        const dailySessions = studentMeta?.sessionsByDate.get(r.date) ?? [];
        const dailyTimes = studentMeta?.timesByDate.get(r.date) ?? [];
        const bestByEvent = studentMeta?.bestByEvent ?? new Map<string, number>();

        // Training calculations
        const sessionsCount = dailySessions.length;
        const dailyDuration = dailySessions.reduce(
          (sum, s) => sum + s.durationMinutes,
          0,
        );
        const dailyDistance = dailySessions.reduce(
          (sum, s) => sum + (s.distanceMeters ?? 0),
          0,
        );
        totalTrainingMinutes += dailyDuration;
        totalDistanceMeters += dailyDistance;

        const strokesPracticed = Array.from(
          new Set(dailySessions.flatMap((s) => s.strokes)),
        );

        const trainingSummary =
          dailySessions.length === 0
            ? "No session recorded"
            : dailySessions
                .map((s) => {
                  const distStr = s.distanceMeters ? `, ${s.distanceMeters}m` : "";
                  const strokeStr =
                    s.strokes.length > 0 ? ` — ${s.strokes.join(", ")}` : "";
                  return `${s.title} (${s.durationMinutes} mins${distStr}${strokeStr})`;
                })
                .join("; ");

        const sessionNotes =
          dailySessions
            .map((s) => s.notes)
            .filter((n): n is string => Boolean(n))
            .join("; ") || null;

        // Time trial and PB calculations
        const timesCount = dailyTimes.length;
        totalTimesRecorded += timesCount;

        const personalBestsAchieved: string[] = [];
        const timesSummaryList: string[] = [];

        for (const t of dailyTimes) {
          const eventKey = `${t.stroke}-${t.distanceMeters}-${t.course}`;
          const isPb = bestByEvent.get(eventKey) === t.timeMs;
          const eventName = formatEventName(t.distanceMeters, t.stroke, t.course);
          const timeStr = formatTimeMs(t.timeMs);

          if (isPb) {
            personalBestsAchieved.push(`${eventName}: ${timeStr}`);
            totalPBsAchieved += 1;
          }

          const pbTag = isPb ? " (PB)" : "";
          const ctxTag = ` [${t.context.replace("_", " ")}]`;
          const noteTag = t.notes ? ` (${t.notes})` : "";
          timesSummaryList.push(`${eventName}: ${timeStr}${pbTag}${ctxTag}${noteTag}`);
        }

        const timesSummary =
          timesSummaryList.length === 0 ? "—" : timesSummaryList.join("; ");

        const timeNotes =
          dailyTimes
            .map((t) => t.notes)
            .filter((n): n is string => Boolean(n))
            .join("; ") || null;

        return {
          _id: r._id,
          studentId: r.studentId,
          studentName: studentMeta?.name ?? "Unknown Student",
          studentEmail: studentMeta?.email ?? "",
          groupName: studentMeta?.groupName ?? null,
          date: r.date,
          status: r.status,
          sessionsCount,
          trainingSummary,
          totalTrainingMinutes: dailyDuration,
          totalDistanceMeters: dailyDistance,
          strokesPracticed,
          sessionNotes,
          timesCount,
          timesSummary,
          personalBestsAchieved,
          timeNotes,
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
        totalTrainingMinutes,
        totalDistanceMeters,
        totalTimesRecorded,
        totalPBsAchieved,
      },
      records: formattedRecords,
    };
  },
});


