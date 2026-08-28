import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import {
  assertCourse,
  assertDateString,
  assertEventDistance,
  assertStroke,
  assertTimeMs,
} from "./lib/validation";
import { formatTimeMs } from "../lib/format";

const NOT_AUTHORIZED = "Not authorized";

const strokeValidator = v.union(
  v.literal("freestyle"),
  v.literal("backstroke"),
  v.literal("breaststroke"),
  v.literal("butterfly"),
  v.literal("im"),
);

const courseValidator = v.union(v.literal("short"), v.literal("long"));

const contextValidator = v.union(
  v.literal("practice"),
  v.literal("time_trial"),
  v.literal("meet"),
);

const timeResultRecord = v.object({
  _id: v.id("timeResults"),
  studentId: v.id("students"),
  date: v.string(),
  distanceMeters: v.number(),
  stroke: v.string(),
  course: courseValidator,
  timeMs: v.number(),
  formattedTime: v.string(),
  context: contextValidator,
  notes: v.union(v.string(), v.null()),
  isPersonalBest: v.boolean(),
  updatedAt: v.number(),
});

const personalBestItem = v.object({
  stroke: v.string(),
  distanceMeters: v.number(),
  course: courseValidator,
  timeMs: v.number(),
  formattedTime: v.string(),
  date: v.string(),
  context: contextValidator,
  event: v.string(),
});

function formatEventName(
  distanceMeters: number,
  stroke: string,
  course: "short" | "long",
): string {
  const strokeNames: Record<string, string> = {
    freestyle: "Freestyle",
    backstroke: "Backstroke",
    breaststroke: "Breaststroke",
    butterfly: "Butterfly",
    im: "Individual Medley",
  };
  const courseStr = course === "short" ? "SCM" : "LCM";
  return `${distanceMeters}m ${strokeNames[stroke] ?? stroke} (${courseStr})`;
}

/**
 * Coach-only: record a swim time result for a student.
 * Detects if the time is a new Personal Best and computes improvement deltas.
 */
export const create = mutation({
  args: {
    studentId: v.id("students"),
    date: v.string(),
    distanceMeters: v.number(),
    stroke: strokeValidator,
    course: courseValidator,
    timeMs: v.number(),
    context: contextValidator,
    notes: v.optional(v.string()),
  },
  returns: v.object({
    timeResultId: v.id("timeResults"),
    isNewPersonalBest: v.boolean(),
    previousBestMs: v.union(v.number(), v.null()),
    deltaMs: v.union(v.number(), v.null()),
    deltaPct: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");

    assertDateString(args.date);
    assertEventDistance(args.distanceMeters);
    assertStroke(args.stroke);
    assertCourse(args.course);
    assertTimeMs(args.timeMs);

    const notes = args.notes?.trim() ? args.notes.trim().slice(0, 500) : undefined;

    // Fetch existing times for this student and event
    const existingTimes = await ctx.db
      .query("timeResults")
      .withIndex("by_student_and_event", (q) =>
        q
          .eq("studentId", args.studentId)
          .eq("stroke", args.stroke)
          .eq("distanceMeters", args.distanceMeters)
          .eq("course", args.course),
      )
      .take(500);

    let previousBestMs: number | null = null;
    let isNewPersonalBest = false;
    let deltaMs: number | null = null;
    let deltaPct: number | null = null;

    if (existingTimes.length === 0) {
      isNewPersonalBest = true;
    } else {
      previousBestMs = Math.min(...existingTimes.map((t) => t.timeMs));
      if (args.timeMs < previousBestMs) {
        isNewPersonalBest = true;
        deltaMs = previousBestMs - args.timeMs;
        deltaPct = Math.round((deltaMs / previousBestMs) * 1000) / 10;
      }
    }

    const timeResultId = await ctx.db.insert("timeResults", {
      studentId: args.studentId,
      date: args.date,
      distanceMeters: args.distanceMeters,
      stroke: args.stroke,
      course: args.course,
      timeMs: args.timeMs,
      context: args.context,
      notes,
      updatedAt: Date.now(),
    });

    return {
      timeResultId,
      isNewPersonalBest,
      previousBestMs,
      deltaMs,
      deltaPct,
    };
  },
});

/**
 * Coach-only: remove an erroneous time result.
 */
export const remove = mutation({
  args: { id: v.id("timeResults") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const existing = await ctx.db.get("timeResults", args.id);
    if (!existing) throw new ConvexError("Time result not found");
    await ctx.db.delete("timeResults", args.id);
    return null;
  },
});

/**
 * Coach or owning student: list chronological swim times for a student.
 */
export const listForStudent = query({
  args: {
    studentId: v.id("students"),
    stroke: v.optional(v.string()),
    distanceMeters: v.optional(v.number()),
    course: v.optional(courseValidator),
  },
  returns: v.array(timeResultRecord),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);

    let timesQuery;
    if (
      args.stroke !== undefined &&
      args.distanceMeters !== undefined &&
      args.course !== undefined
    ) {
      timesQuery = ctx.db
        .query("timeResults")
        .withIndex("by_student_and_event", (q) =>
          q
            .eq("studentId", studentId)
            .eq("stroke", args.stroke!)
            .eq("distanceMeters", args.distanceMeters!)
            .eq("course", args.course!),
        );
    } else {
      timesQuery = ctx.db
        .query("timeResults")
        .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId));
    }

    const allTimes = await timesQuery.order("desc").take(1000);

    // Calculate best time per event to mark PB flag
    const bestByEvent = new Map<string, number>();
    for (const t of allTimes) {
      const eventKey = `${t.stroke}-${t.distanceMeters}-${t.course}`;
      const cur = bestByEvent.get(eventKey);
      if (cur === undefined || t.timeMs < cur) {
        bestByEvent.set(eventKey, t.timeMs);
      }
    }

    return allTimes.map((t) => {
      const eventKey = `${t.stroke}-${t.distanceMeters}-${t.course}`;
      const best = bestByEvent.get(eventKey);
      return {
        _id: t._id,
        studentId: t.studentId,
        date: t.date,
        distanceMeters: t.distanceMeters,
        stroke: t.stroke,
        course: t.course,
        timeMs: t.timeMs,
        formattedTime: formatTimeMs(t.timeMs),
        context: t.context,
        notes: t.notes ?? null,
        isPersonalBest: best !== undefined && t.timeMs === best,
        updatedAt: t.updatedAt,
      };
    });
  },
});

/**
 * Coach or owning student: summary of Personal Bests across all events.
 */
export const getPersonalBests = query({
  args: { studentId: v.id("students") },
  returns: v.array(personalBestItem),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);

    const allTimes = await ctx.db
      .query("timeResults")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .take(2000);

    const pbsByEvent = new Map<
      string,
      {
        stroke: string;
        distanceMeters: number;
        course: "short" | "long";
        timeMs: number;
        date: string;
        context: "practice" | "time_trial" | "meet";
      }
    >();

    for (const t of allTimes) {
      const eventKey = `${t.stroke}-${t.distanceMeters}-${t.course}`;
      const existing = pbsByEvent.get(eventKey);
      if (!existing || t.timeMs < existing.timeMs) {
        pbsByEvent.set(eventKey, {
          stroke: t.stroke,
          distanceMeters: t.distanceMeters,
          course: t.course,
          timeMs: t.timeMs,
          date: t.date,
          context: t.context,
        });
      }
    }

    const pbs = Array.from(pbsByEvent.values()).map((pb) => ({
      ...pb,
      formattedTime: formatTimeMs(pb.timeMs),
      event: formatEventName(pb.distanceMeters, pb.stroke, pb.course),
    }));

    return pbs.sort((a, b) => {
      if (a.stroke !== b.stroke) return a.stroke.localeCompare(b.stroke);
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
      return a.course.localeCompare(b.course);
    });
  },
});

/**
 * Student-only: personal bests for the signed-in student.
 */
export const myPersonalBests = query({
  args: {},
  returns: v.array(personalBestItem),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);
    const studentId = self.student._id;

    const allTimes = await ctx.db
      .query("timeResults")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .take(2000);

    const pbsByEvent = new Map<
      string,
      {
        stroke: string;
        distanceMeters: number;
        course: "short" | "long";
        timeMs: number;
        date: string;
        context: "practice" | "time_trial" | "meet";
      }
    >();

    for (const t of allTimes) {
      const eventKey = `${t.stroke}-${t.distanceMeters}-${t.course}`;
      const existing = pbsByEvent.get(eventKey);
      if (!existing || t.timeMs < existing.timeMs) {
        pbsByEvent.set(eventKey, {
          stroke: t.stroke,
          distanceMeters: t.distanceMeters,
          course: t.course,
          timeMs: t.timeMs,
          date: t.date,
          context: t.context,
        });
      }
    }

    const pbs = Array.from(pbsByEvent.values()).map((pb) => ({
      ...pb,
      formattedTime: formatTimeMs(pb.timeMs),
      event: formatEventName(pb.distanceMeters, pb.stroke, pb.course),
    }));

    return pbs.sort((a, b) => {
      if (a.stroke !== b.stroke) return a.stroke.localeCompare(b.stroke);
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
      return a.course.localeCompare(b.course);
    });
  },
});

/**
 * Coach-only: squad-wide recent times feed.
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("timeResults"),
      studentId: v.id("students"),
      studentName: v.string(),
      date: v.string(),
      distanceMeters: v.number(),
      stroke: v.string(),
      course: courseValidator,
      timeMs: v.number(),
      formattedTime: v.string(),
      context: contextValidator,
      event: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const limit = args.limit ?? 20;
    const times = await ctx.db
      .query("timeResults")
      .withIndex("by_date")
      .order("desc")
      .take(limit);

    const studentIds = Array.from(new Set(times.map((t) => t.studentId)));
    const studentNameMap = new Map<string, string>();

    await Promise.all(
      studentIds.map(async (sId) => {
        const student = await ctx.db.get("students", sId);
        if (!student) return;
        const user = await ctx.db.get("users", student.userId);
        if (user?.name) studentNameMap.set(sId, user.name);
      }),
    );

    return times.map((t) => ({
      _id: t._id,
      studentId: t.studentId,
      studentName: studentNameMap.get(t.studentId) ?? "Unknown",
      date: t.date,
      distanceMeters: t.distanceMeters,
      stroke: t.stroke,
      course: t.course,
      timeMs: t.timeMs,
      formattedTime: formatTimeMs(t.timeMs),
      context: t.context,
      event: formatEventName(t.distanceMeters, t.stroke, t.course),
      updatedAt: t.updatedAt,
    }));
  },
});
