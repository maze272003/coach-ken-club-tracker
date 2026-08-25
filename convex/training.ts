import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import { assertStroke } from "./lib/strokes";
import { assertDateString, assertDuration } from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const sessionFields = {
  date: v.string(),
  title: v.string(),
  durationMinutes: v.number(),
  strokes: v.array(v.string()),
  notes: v.optional(v.string()),
};

const sessionRecord = v.object({
  _id: v.id("trainingSessions"),
  studentId: v.id("students"),
  date: v.string(),
  title: v.string(),
  durationMinutes: v.number(),
  strokes: v.array(v.string()),
  notes: v.union(v.string(), v.null()),
});

function validateSessionFields(args: {
  date: string;
  title: string;
  durationMinutes: number;
  strokes: string[];
  notes?: string;
}) {
  assertDateString(args.date);
  const title = args.title.trim();
  if (title.length === 0 || title.length > 120) {
    throw new ConvexError("Title must be between 1 and 120 characters");
  }
  assertDuration(args.durationMinutes);
  const strokes = [...new Set(args.strokes)];
  if (strokes.length === 0) {
    throw new ConvexError("Select at least one stroke");
  }
  for (const stroke of strokes) {
    assertStroke(stroke);
  }
  if (args.notes !== undefined && args.notes.trim().length > 2000) {
    throw new ConvexError("Notes must be at most 2000 characters");
  }
  return {
    date: args.date,
    title,
    durationMinutes: args.durationMinutes,
    strokes,
    notes: args.notes?.trim() || undefined,
  };
}

/**
 * Coach-only: create a training session for a student.
 */
export const create = mutation({
  args: { studentId: v.id("students"), ...sessionFields },
  returns: v.object({ sessionId: v.id("trainingSessions") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");

    const fields = validateSessionFields(args);
    const sessionId = await ctx.db.insert("trainingSessions", {
      studentId: args.studentId,
      ...fields,
      updatedAt: Date.now(),
    });
    return { sessionId };
  },
});

/**
 * Coach-only: update a training session.
 */
export const update = mutation({
  args: { sessionId: v.id("trainingSessions"), ...sessionFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const session = await ctx.db.get("trainingSessions", args.sessionId);
    if (!session) throw new ConvexError("Training session not found");

    const fields = validateSessionFields(args);
    await ctx.db.patch("trainingSessions", args.sessionId, {
      ...fields,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach or owning student: a student's training sessions,
 * most recent first.
 */
export const listForStudent = query({
  args: {
    studentId: v.id("students"),
    limit: v.optional(v.number()),
  },
  returns: v.array(sessionRecord),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);

    const sessions = await ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(limit);
    return sessions.map((s) => ({
      _id: s._id,
      studentId: s.studentId,
      date: s.date,
      title: s.title,
      durationMinutes: s.durationMinutes,
      strokes: s.strokes,
      notes: s.notes ?? null,
    }));
  },
});

/**
 * Student-only: the signed-in student's own training sessions.
 */
export const mySessions = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(sessionRecord),
  handler: async (ctx, args) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);

    const sessions = await ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_date", (q) =>
        q.eq("studentId", self.student._id),
      )
      .order("desc")
      .take(limit);
    return sessions.map((s) => ({
      _id: s._id,
      studentId: s.studentId,
      date: s.date,
      title: s.title,
      durationMinutes: s.durationMinutes,
      strokes: s.strokes,
      notes: s.notes ?? null,
    }));
  },
});

/**
 * Coach-only: recent training sessions across all students.
 */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      sessionId: v.id("trainingSessions"),
      studentId: v.id("students"),
      studentName: v.string(),
      date: v.string(),
      title: v.string(),
      durationMinutes: v.number(),
      strokes: v.array(v.string()),
      notes: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const sessions = await ctx.db
      .query("trainingSessions")
      .withIndex("by_date")
      .order("desc")
      .take(limit);

    const nameCache = new Map<string, string>();
    const rows = await Promise.all(
      sessions.map(async (s) => {
        let name = nameCache.get(s.studentId);
        if (name === undefined) {
          const student = await ctx.db.get("students", s.studentId);
          const user = student
            ? await ctx.db.get("users", student.userId)
            : null;
          name = user?.name ?? "Unknown";
          nameCache.set(s.studentId, name);
        }
        return {
          sessionId: s._id,
          studentId: s.studentId,
          studentName: name,
          date: s.date,
          title: s.title,
          durationMinutes: s.durationMinutes,
          strokes: s.strokes,
          notes: s.notes ?? null,
        };
      }),
    );
    return rows;
  },
});
