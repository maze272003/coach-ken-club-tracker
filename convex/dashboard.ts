import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireCoach, requireStudent } from "./lib/access";
import { attendanceStats, overallProgress } from "./lib/stats";
import {
  daysBetween,
  monthKeysBack,
  todayInCoachTz,
  weekStartIso,
  weekStartsBack,
} from "./lib/time";
import { pbsInMonth } from "./lib/kpis";

const NOT_AUTHORIZED = "Not authorized";

/**
 * Coach-only: dashboard v2 — bounded KPI scans, goal deadlines,
 * and the recent activity feed.
 */
export const coachOverview = query({
  args: {},
  returns: v.object({
    stats: v.object({
      totalStudents: v.number(),
      activeStudents: v.number(),
      pbsThisMonth: v.number(),
    }),
    kpis: v.object({
      attendanceThisMonth: v.union(v.number(), v.null()),
      attendanceLastMonth: v.union(v.number(), v.null()),
      volumeThisWeek: v.union(v.number(), v.null()),
      volumeLastWeek: v.union(v.number(), v.null()),
    }),
    goalDeadlines: v.array(
      v.object({
        studentName: v.string(),
        title: v.string(),
        targetDate: v.string(),
      }),
    ),
    recentActivity: v.array(
      v.object({
        kind: v.union(
          v.literal("attendance"),
          v.literal("session"),
          v.literal("skill"),
          v.literal("goal"),
        ),
        studentName: v.string(),
        detail: v.string(),
        atMs: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const today = todayInCoachTz();
    const [lastMonth] = monthKeysBack(2, today);
    const thisMonth = today.slice(0, 7);
    const weekKeys = weekStartsBack(2, today);

    const students = await ctx.db.query("students").take(500);
    const activeStudents = students.filter((s) => s.status === "active");

    const [attendance, sessions] = await Promise.all([
      ctx.db
        .query("attendance")
        .withIndex("by_date", (q) => q.gte("date", `${lastMonth}-01`))
        .take(10000),
      ctx.db
        .query("trainingSessions")
        .withIndex("by_date", (q) => q.gte("date", weekKeys[0]!))
        .take(5000),
    ]);

    const monthPct = (key: string): number | null => {
      const records = attendance.filter((r) => r.date.slice(0, 7) === key);
      if (records.length === 0) return null;
      const attended = records.filter((r) => r.status !== "absent").length;
      return Math.round((attended / records.length) * 100);
    };

    const weekVolume = (key: string): number | null => {
      const inWeek = sessions.filter((s) => weekStartIso(s.date) === key);
      if (inWeek.length === 0) return null;
      return inWeek.reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);
    };

    let pbsThisMonth = 0;
    for (const student of activeStudents) {
      pbsThisMonth += await pbsInMonth(ctx, student._id, thisMonth);
    }

    const nameCache = new Map<string, string>();
    const goalRows: { studentName: string; title: string; targetDate: string }[] = [];
    for (const student of activeStudents) {
      const goals = await ctx.db
        .query("trainingGoals")
        .withIndex("by_student_and_updated", (q) => q.eq("studentId", student._id))
        .order("desc")
        .take(20);
      for (const goal of goals) {
        if (goal.status === "completed" || goal.status === "archived") continue;
        if (!goal.targetDate) continue;
        const days = daysBetween(today, goal.targetDate);
        if (days < 0 || days > 14) continue;
        let name = nameCache.get(student._id);
        if (name === undefined) {
          const user = await ctx.db.get("users", student.userId);
          name = user?.name ?? "Unknown";
          nameCache.set(student._id, name);
        }
        goalRows.push({ studentName: name, title: goal.title, targetDate: goal.targetDate });
      }
    }
    goalRows.sort((a, b) => a.targetDate.localeCompare(b.targetDate));

    const recentActivity = await buildRecentActivity(ctx);

    return {
      stats: {
        totalStudents: students.length,
        activeStudents: activeStudents.length,
        pbsThisMonth,
      },
      kpis: {
        attendanceThisMonth: monthPct(thisMonth),
        attendanceLastMonth: monthPct(lastMonth),
        volumeThisWeek: weekVolume(weekKeys[1]!),
        volumeLastWeek: weekVolume(weekKeys[0]!),
      },
      goalDeadlines: goalRows.slice(0, 10),
      recentActivity,
    };
  },
});

async function studentNameFor(
  ctx: QueryCtx,
  studentId: Id<"students">,
  cache: Map<string, string>,
): Promise<string> {
  let name = cache.get(studentId);
  if (name === undefined) {
    const student = await ctx.db.get("students", studentId);
    const user = student ? await ctx.db.get("users", student.userId) : null;
    name = user?.name ?? "Unknown";
    cache.set(studentId, name);
  }
  return name;
}

async function buildRecentActivity(ctx: QueryCtx) {
  const nameCache = new Map<string, string>();
  const catalog = await ctx.db.query("skills").withIndex("by_key").take(500);
  const skillNameCache = new Map(
    catalog.map((skill) => [skill.key, skill.name]),
  );
  const skillNameByKey = (key: string) => skillNameCache.get(key) ?? key;

  const [attendance, sessions, skills, goals] = await Promise.all([
    ctx.db.query("attendance").order("desc").take(2),
    ctx.db.query("trainingSessions").order("desc").take(2),
    ctx.db.query("strokeSkills").order("desc").take(2),
    ctx.db.query("trainingGoals").order("desc").take(2),
  ]);

  const attendanceLabels: Record<string, string> = {
    present: "present",
    late: "arrived late",
    absent: "absent",
  };

  const items: {
    kind: "attendance" | "session" | "skill" | "goal";
    studentId: Id<"students">;
    detail: string;
    atMs: number;
  }[] = [];

  for (const record of attendance) {
    items.push({
      kind: "attendance",
      studentId: record.studentId,
      detail: `attendance recorded (${attendanceLabels[record.status]} on ${record.date})`,
      atMs: record._creationTime,
    });
  }
  for (const session of sessions) {
    items.push({
      kind: "session",
      studentId: session.studentId,
      detail: `training session "${session.title}" (${session.durationMinutes} min)`,
      atMs: session._creationTime,
    });
  }
  for (const skill of skills) {
    items.push({
      kind: "skill",
      studentId: skill.studentId,
      detail: `${skillNameByKey(skill.stroke)} skill progress updated to ${skill.progress}%`,
      atMs: skill._creationTime,
    });
  }
  for (const goal of goals) {
    items.push({
      kind: "goal",
      studentId: goal.studentId,
      detail: `goal "${goal.title}" updated (${goal.progress}%)`,
      atMs: goal._creationTime,
    });
  }

  const withNames = await Promise.all(
    items
      .sort((a, b) => b.atMs - a.atMs)
      .slice(0, 8)
      .map(async (item) => ({
        kind: item.kind,
        studentName: await studentNameFor(ctx, item.studentId, nameCache),
        detail: item.detail,
        atMs: item.atMs,
      })),
  );
  return withNames;
}

/**
 * Student-only: everything the student dashboard needs in one
 * consistent snapshot.
 */
export const studentDashboard = query({
  args: {},
  returns: v.object({
    attendance: v.object({
      total: v.number(),
      attended: v.number(),
      present: v.number(),
      late: v.number(),
      absent: v.number(),
      percentage: v.union(v.number(), v.null()),
    }),
    overallProgress: v.union(v.number(), v.null()),
    skills: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        progress: v.number(),
        updatedAtMs: v.number(),
      }),
    ),
    recentSessions: v.array(
      v.object({
        _id: v.id("trainingSessions"),
        date: v.string(),
        title: v.string(),
        durationMinutes: v.number(),
        strokes: v.array(v.string()),
        notes: v.union(v.string(), v.null()),
      }),
    ),
    currentGoal: v.union(
      v.null(),
      v.object({
        _id: v.id("trainingGoals"),
        title: v.string(),
        description: v.union(v.string(), v.null()),
        target: v.union(v.string(), v.null()),
        progress: v.number(),
        status: v.union(
          v.literal("not_started"),
          v.literal("in_progress"),
          v.literal("completed"),
          v.literal("archived"),
        ),

        targetDate: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);
    const studentId = self.student._id;

    const [attendance, progress, skills, catalog, sessions, goals] =
      await Promise.all([
        attendanceStats(ctx, studentId),
        overallProgress(ctx, studentId),
        ctx.db
          .query("strokeSkills")
          .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
          .take(100),
        ctx.db.query("skills").withIndex("by_key").take(500),
        ctx.db
          .query("trainingSessions")
          .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
          .order("desc")
          .take(3),
        ctx.db
          .query("trainingGoals")
          .withIndex("by_student_and_updated", (q) => q.eq("studentId", studentId))
          .order("desc")
          .take(50),
      ]);

    const currentGoal =
      goals.find((g) => g.status !== "completed") ?? goals[0] ?? null;

    const activeSkillNames = new Map(
      catalog
        .filter((s) => s.status === "active")
        .map((s) => [s.key, s.name]),
    );

    return {
      attendance,
      overallProgress: progress,
      skills: skills
        .filter((s) => activeSkillNames.has(s.stroke))
        .map((s) => ({
          key: s.stroke,
          name: activeSkillNames.get(s.stroke)!,
          progress: s.progress,
          updatedAtMs: s.updatedAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      recentSessions: sessions.map((s) => ({
        _id: s._id,
        date: s.date,
        title: s.title,
        durationMinutes: s.durationMinutes,
        strokes: s.strokes,
        notes: s.notes ?? null,
      })),
      currentGoal:
        currentGoal === null
          ? null
          : {
              _id: currentGoal._id,
              title: currentGoal.title,
              description: currentGoal.description ?? null,
              target: currentGoal.target ?? null,
              progress: currentGoal.progress,
              status: currentGoal.status,
              targetDate: currentGoal.targetDate ?? null,
            },
    };
  },
});
