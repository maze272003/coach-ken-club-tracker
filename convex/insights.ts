// convex/insights.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireCoach } from "./lib/access";
import {
  SEVERITY_ORDER,
  attendanceDropFlag,
  consecutiveMissesFlag,
  goalDeadlineFlag,
  inactiveFlag,
  plateauFlag,
  type EventHistory,
  type Flag,
} from "./lib/flags";
import { todayInCoachTz, daysBetween } from "./lib/time";

const NOT_AUTHORIZED = "Not authorized";

/**
 * Fetches each student's bounded data windows and evaluates every
 * flag rule. Shared by the on-demand coach query and the weekly
 * report cron.
 */
export async function collectStudentFlags(
  ctx: QueryCtx,
  student: Doc<"students">,
  today: string,
): Promise<Flag[]> {
  const [attendance, times, goals, lastSession] = await Promise.all([
    ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", student._id))
      .order("desc")
      .take(30),
    ctx.db
      .query("timeResults")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", student._id))
      .order("desc")
      .take(500),
    ctx.db
      .query("trainingGoals")
      .withIndex("by_student_and_updated", (q) => q.eq("studentId", student._id))
      .order("desc")
      .take(50),
    ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", student._id))
      .order("desc")
      .take(1),
  ]);

  const eventsMap = new Map<string, EventHistory>();
  for (const result of times) {
    const key = `${result.stroke}-${result.distanceMeters}-${result.course}`;
    const event = eventsMap.get(key) ?? {
      stroke: result.stroke,
      distanceMeters: result.distanceMeters,
      course: result.course,
      results: [],
    };
    event.results.push({ date: result.date, timeMs: result.timeMs });
    eventsMap.set(key, event);
  }

  const anchor =
    student.joinedAt ?? new Date(student._creationTime).toISOString().slice(0, 10);
  const recordAgeDays = daysBetween(anchor, today);

  return [
    consecutiveMissesFlag(attendance),
    attendanceDropFlag(attendance, today),
    plateauFlag([...eventsMap.values()], today),
    goalDeadlineFlag(goals, today),
    inactiveFlag(lastSession[0]?.date ?? null, today, recordAgeDays),
  ].filter((f): f is Flag => f !== null);
}

/**
 * Coach-only: the "who needs attention" list, computed on demand.
 */
export const coachAttentionFlags = query({
  args: {},
  returns: v.object({
    flags: v.array(
      v.object({
        studentId: v.id("students"),
        studentName: v.string(),
        kind: v.string(),
        severity: v.string(),
        detail: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const today = todayInCoachTz();
    const students = await ctx.db.query("students").take(500);
    const nameCache = new Map<Id<"students">, string>();

    const all: {
      studentId: Id<"students">;
      studentName: string;
      flag: Flag;
    }[] = [];
    for (const student of students) {
      if (student.status !== "active") continue;
      const flags = await collectStudentFlags(ctx, student, today);
      if (flags.length === 0) continue;
      let name = nameCache.get(student._id);
      if (name === undefined) {
        const user = await ctx.db.get("users", student.userId);
        name = user?.name ?? "Unknown";
        nameCache.set(student._id, name);
      }
      for (const flag of flags) {
        all.push({ studentId: student._id, studentName: name, flag });
      }
    }

    all.sort((a, b) => {
      const bySeverity =
        SEVERITY_ORDER[a.flag.severity] - SEVERITY_ORDER[b.flag.severity];
      if (bySeverity !== 0) return bySeverity;
      return a.studentName.localeCompare(b.studentName);
    });

    return {
      flags: all.map(({ studentId, studentName, flag }) => ({
        studentId,
        studentName,
        kind: flag.kind,
        severity: flag.severity,
        detail: flag.detail,
      })),
    };
  },
});
