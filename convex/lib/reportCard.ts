// convex/lib/reportCard.ts
import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  attendanceStats,
  commitmentStats,
  deriveGoalProgress,
} from "./stats";
import { weekStartIso, weekStartsBack } from "./time";

export const athleteCardVal = v.object({
  student: v.object({
    name: v.string(),
    email: v.union(v.string(), v.null()),
    age: v.union(v.number(), v.null()),
    joinedAt: v.union(v.string(), v.null()),
  }),
  groupName: v.union(v.string(), v.null()),
  attendance: v.object({
    total: v.number(),
    attended: v.number(),
    percentage: v.union(v.number(), v.null()),
  }),
  commitment: v.union(
    v.object({
      held: v.number(),
      attended: v.number(),
      percentage: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  volumeByWeek: v.array(
    v.object({ label: v.string(), value: v.union(v.number(), v.null()) }),
  ),
  skills: v.array(v.object({ name: v.string(), progress: v.number() })),
  pbs: v.array(
    v.object({
      label: v.string(),
      bestTimeMs: v.number(),
      bestDate: v.string(),
      resultCount: v.number(),
    }),
  ),
  goals: v.array(
    v.object({
      title: v.string(),
      status: v.string(),
      progress: v.number(),
      targetDate: v.union(v.string(), v.null()),
    }),
  ),
});

export type AthleteCard = Infer<typeof athleteCardVal>;

function ageFrom(dob: string | undefined, today: string): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const years = Math.floor((now - birth) / (365.25 * 86_400_000));
  return years >= 3 && years <= 100 ? years : null;
}

/**
 * Full athlete report card for a student document. Auth-free: callers
 * (coach query, email pipeline) enforce their own access rules.
 */
export async function buildAthleteCard(
  ctx: QueryCtx,
  student: Doc<"students">,
  today: string,
): Promise<AthleteCard> {
  const user = await ctx.db.get("users", student.userId);
  const weekKeys = weekStartsBack(12, today);

  const [attendance, commitment, sessions, skills, catalog, times, goals] =
    await Promise.all([
      attendanceStats(ctx, student._id),
      commitmentStats(ctx, student._id),
      ctx.db
        .query("trainingSessions")
        .withIndex("by_student_and_date", (q) => q.eq("studentId", student._id))
        .take(1000),
      ctx.db
        .query("strokeSkills")
        .withIndex("by_student_and_stroke", (q) => q.eq("studentId", student._id))
        .take(100),
      ctx.db.query("skills").withIndex("by_key").take(500),
      ctx.db
        .query("timeResults")
        .withIndex("by_student_and_date", (q) => q.eq("studentId", student._id))
        .take(500),
      ctx.db
        .query("trainingGoals")
        .withIndex("by_student_and_updated", (q) => q.eq("studentId", student._id))
        .order("desc")
        .take(50),
    ]);

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
  const skillRows = skills
    .filter((s) => catalog.length === 0 || activeNames.has(s.stroke))
    .map((s) => ({
      name: activeNames.get(s.stroke) ?? s.stroke,
      progress: s.progress,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const eventsMap = new Map<
    string,
    { label: string; bestTimeMs: number; bestDate: string; count: number }
  >();
  for (const result of times) {
    const key = `${result.stroke}-${result.distanceMeters}-${result.course}`;
    const label = `${result.distanceMeters}m ${result.stroke} (${result.course === "short" ? "SC" : "LC"})`;
    const existing = eventsMap.get(key);
    if (!existing || result.timeMs < existing.bestTimeMs) {
      eventsMap.set(key, {
        label,
        bestTimeMs: result.timeMs,
        bestDate: result.date,
        count: (existing?.count ?? 0) + 1,
      });
    } else {
      existing.count += 1;
    }
  }
  const pbs = [...eventsMap.values()].map((e) => ({
    label: e.label,
    bestTimeMs: e.bestTimeMs,
    bestDate: e.bestDate,
    resultCount: e.count,
  })).sort((a, b) => a.label.localeCompare(b.label));

  const goalRows = await Promise.all(
    goals.slice(0, 10).map(async (goal) => {
      const derived = await deriveGoalProgress(ctx, goal);
      return {
        title: goal.title,
        status: derived.status,
        progress: derived.progress,
        targetDate: goal.targetDate ?? null,
      };
    }),
  );

  let groupName: string | null = null;
  if (student.groupId) {
    const group = await ctx.db.get("groups", student.groupId);
    groupName = group?.name ?? null;
  }

  return {
    student: {
      name: user?.name ?? "Unknown",
      email: user?.email ?? null,
      age: ageFrom(student.dateOfBirth, today),
      joinedAt: student.joinedAt ?? null,
    },
    groupName,
    attendance: {
      total: attendance.total,
      attended: attendance.attended,
      percentage: attendance.percentage,
    },
    commitment,
    volumeByWeek,
    skills: skillRows,
    pbs,
    goals: goalRows,
  };
}
