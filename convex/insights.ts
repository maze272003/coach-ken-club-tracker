// convex/insights.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
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
import {
  daysBetween,
  monthKeysBack,
  todayInCoachTz,
  weekStartIso,
  weekStartsBack,
} from "./lib/time";

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

const pointVal = v.object({
  label: v.string(),
  value: v.union(v.number(), v.null()),
});

const trendsVal = v.object({
  attendanceByMonth: v.array(pointVal),
  volumeByWeek: v.array(pointVal),
  skillRadar: v.array(v.object({ label: v.string(), value: v.number() })),
  pbProgression: v.array(
    v.object({
      label: v.string(),
      points: v.array(v.object({ date: v.string(), timeMs: v.number() })),
    }),
  ),
});

type Trends = {
  attendanceByMonth: { label: string; value: number | null }[];
  volumeByWeek: { label: string; value: number | null }[];
  skillRadar: { label: string; value: number }[];
  pbProgression: {
    label: string;
    points: { date: string; timeMs: number }[];
  }[];
};

async function trendsForStudent(
  ctx: QueryCtx,
  studentId: Id<"students">,
): Promise<Trends> {
  const today = todayInCoachTz();
  const monthKeys = monthKeysBack(6, today);
  const weekKeys = weekStartsBack(12, today);

  const [attendance, sessions, skills, catalog, times] = await Promise.all([
    ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .take(500),
    ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .take(1000),
    ctx.db
      .query("strokeSkills")
      .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
      .take(100),
    ctx.db.query("skills").withIndex("by_key").take(500),
    ctx.db
      .query("timeResults")
      .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
      .take(500),
  ]);

  const attendanceByMonth = monthKeys.map((key) => {
    const records = attendance.filter((r) => r.date.slice(0, 7) === key);
    if (records.length === 0) return { label: key, value: null };
    const attended = records.filter((r) => r.status !== "absent").length;
    return { label: key, value: Math.round((attended / records.length) * 100) };
  });

  const volumeByWeek = weekKeys.map((key) => {
    const inWeek = sessions.filter(
      (s) => weekStartIso(s.date) === key && s.distanceMeters !== undefined,
    );
    if (inWeek.length === 0) return { label: key, value: null };
    return {
      label: key,
      value: inWeek.reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0),
    };
  });

  const activeNames = new Map(
    catalog.filter((s) => s.status === "active").map((s) => [s.key, s.name]),
  );
  const skillRadar = skills
    .filter((s) => activeNames.has(s.stroke))
    .map((s) => ({ label: activeNames.get(s.stroke)!, value: s.progress }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const eventsMap = new Map<
    string,
    { label: string; points: { date: string; timeMs: number }[] }
  >();
  for (const result of [...times].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${result.stroke}-${result.distanceMeters}-${result.course}`;
    const label = `${result.distanceMeters}m ${result.stroke} (${result.course === "short" ? "SC" : "LC"})`;
    const event = eventsMap.get(key) ?? { label, points: [] };
    event.points.push({ date: result.date, timeMs: result.timeMs });
    eventsMap.set(key, event);
  }
  const pbProgression = [...eventsMap.values()].filter(
    (event) => event.points.length >= 2,
  );

  return { attendanceByMonth, volumeByWeek, skillRadar, pbProgression };
}

/** Coach-only: trends for any student. */
export const studentTrends = query({
  args: { studentId: v.id("students") },
  returns: trendsVal,
  handler: async (ctx, { studentId }) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const resolved = await resolveStudentAccess(ctx, studentId);
    if (resolved === null) throw new ConvexError("Student not found");
    return await trendsForStudent(ctx, resolved);
  },
});

/** Student-only: the signed-in swimmer's own trends. */
export const myTrends = query({
  args: {},
  returns: trendsVal,
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);
    return await trendsForStudent(ctx, self.student._id);
  },
});

/** Coach-only: team attendance trend and volume by group. */
export const teamTrends = query({
  args: {},
  returns: v.object({
    attendanceByMonth: v.array(pointVal),
    volumeByGroup: v.array(v.object({ label: v.string(), value: v.number() })),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const today = todayInCoachTz();
    const monthKeys = monthKeysBack(6, today);
    const firstMonthStart = `${monthKeys[0]}-01`;

    const [attendance, groups, students, sessions] = await Promise.all([
      ctx.db
        .query("attendance")
        .withIndex("by_date", (q) => q.gte("date", firstMonthStart))
        .take(10000),
      ctx.db
        .query("groups")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(500),
      ctx.db.query("students").take(500),
      ctx.db
        .query("trainingSessions")
        .withIndex("by_date", (q) => q.gte("date", weekStartsBack(8, today)[0]))
        .take(5000),
    ]);

    const attendanceByMonth = monthKeys.map((key) => {
      const records = attendance.filter((r) => r.date.slice(0, 7) === key);
      if (records.length === 0) return { label: key, value: null };
      const attended = records.filter((r) => r.status !== "absent").length;
      return { label: key, value: Math.round((attended / records.length) * 100) };
    });

    const groupIdByStudent = new Map(students.map((s) => [s._id, s.groupId]));
    const volumeByGroup = groups.map((group) => ({
      label: group.name,
      value: sessions
        .filter((s) => groupIdByStudent.get(s.studentId) === group._id)
        .reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0),
    }));

    return { attendanceByMonth, volumeByGroup };
  },
});
