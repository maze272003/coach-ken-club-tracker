// convex/reports.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { collectStudentFlags } from "./insights";
import {
  attendanceStats,
  commitmentStats,
  deriveGoalProgress,
} from "./lib/stats";
import { datePlusDays, todayInCoachTz, weekStartIso, weekStartsBack } from "./lib/time";

const NOT_AUTHORIZED = "Not authorized";

const athleteCardVal = v.object({
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

function ageFrom(dob: string | undefined, today: string): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const years = Math.floor((now - birth) / (365.25 * 86_400_000));
  return years >= 3 && years <= 100 ? years : null;
}

/**
 * Coach-only: print-ready athlete report card, computed on demand
 * (never stored).
 */
export const athleteCard = query({
  args: { studentId: v.id("students") },
  returns: athleteCardVal,
  handler: async (ctx, { studentId }) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const student = await ctx.db.get("students", studentId);
    if (!student) throw new ConvexError("Student not found");
    const user = await ctx.db.get("users", student.userId);

    const today = todayInCoachTz();
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
  },
});

type GroupReport = {
  groupName: string;
  practicesHeld: number;
  attendancePct: number | null;
  volumeMeters: number;
  pbs: number;
  flagsRaised: number;
};

/**
 * Weekly team report for the ISO week that just ended. Idempotent:
 * keyed by weekStart — re-running replaces the same week's doc.
 * Per-group failures are isolated into payload.errors.
 */
export const generateWeekly = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const today = todayInCoachTz();
    const weekStart = weekStartIso(datePlusDays(today, -1));
    const weekEnd = datePlusDays(weekStart, 6);

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(500);
    const students = await ctx.db.query("students").take(500);

    const groupReports: GroupReport[] = [];
    const errors: { groupName: string; error: string }[] = [];

    for (const group of groups) {
      try {
        const members = students.filter(
          (s) => s.groupId === group._id && s.status === "active",
        );
        const memberIds = new Set(members.map((m) => m._id));

        const [practices, attendance, sessions] = await Promise.all([
          ctx.db
            .query("practices")
            .withIndex("by_group_and_date", (q) =>
              q.eq("groupId", group._id).gte("date", weekStart).lte("date", weekEnd),
            )
            .take(100),
          ctx.db
            .query("attendance")
            .withIndex("by_date", (q) => q.gte("date", weekStart).lte("date", weekEnd))
            .take(10000),
          ctx.db
            .query("trainingSessions")
            .withIndex("by_date", (q) => q.gte("date", weekStart).lte("date", weekEnd))
            .take(10000),
        ]);

        const practicesHeld = practices.filter((p) => p.status === "completed").length;

        const memberAttendance = attendance.filter((a) => memberIds.has(a.studentId));
        const attended = memberAttendance.filter((a) => a.status !== "absent").length;
        const attendancePct =
          memberAttendance.length === 0
            ? null
            : Math.round((attended / memberAttendance.length) * 100);

        const volumeMeters = sessions
          .filter((s) => memberIds.has(s.studentId))
          .reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);

        let pbs = 0;
        for (const member of members) {
          const weekResults = await ctx.db
            .query("timeResults")
            .withIndex("by_student_and_date", (q) =>
              q.eq("studentId", member._id).gte("date", weekStart).lte("date", weekEnd),
            )
            .take(100);
          for (const result of weekResults) {
            const priors = await ctx.db
              .query("timeResults")
              .withIndex("by_student_and_event", (q) =>
                q
                  .eq("studentId", member._id)
                  .eq("stroke", result.stroke)
                  .eq("distanceMeters", result.distanceMeters)
                  .eq("course", result.course),
              )
              .take(500);
            // New PB: strictly faster than every result dated before this one.
            const isPb = priors.every(
              (p) => !(p.date < result.date) || p.timeMs > result.timeMs,
            );
            if (isPb) pbs += 1;
          }
        }

        let flagsRaised = 0;
        for (const member of members) {
          flagsRaised += (await collectStudentFlags(ctx, member, today)).length;
        }

        groupReports.push({
          groupName: group.name,
          practicesHeld,
          attendancePct,
          volumeMeters,
          pbs,
          flagsRaised,
        });
      } catch (err) {
        errors.push({
          groupName: group.name,
          error: err instanceof Error ? err.message : "unknown error",
        });
      }
    }

    const withPct = groupReports.filter((g) => g.attendancePct !== null);
    const payload = {
      weekStart,
      team: {
        practicesHeld: groupReports.reduce((acc, g) => acc + g.practicesHeld, 0),
        attendancePct:
          withPct.length === 0
            ? null
            : Math.round(
                withPct.reduce((acc, g) => acc + g.attendancePct!, 0) / withPct.length,
              ),
        volumeMeters: groupReports.reduce((acc, g) => acc + g.volumeMeters, 0),
        pbs: groupReports.reduce((acc, g) => acc + g.pbs, 0),
        flagsRaised: groupReports.reduce((acc, g) => acc + g.flagsRaised, 0),
      },
      groups: groupReports,
      errors,
    };

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_week_start", (q) => q.eq("weekStart", weekStart))
      .unique();
    if (existing) await ctx.db.delete("reports", existing._id);
    await ctx.db.insert("reports", {
      weekStart,
      payloadJson: JSON.stringify(payload),
      createdAt: Date.now(),
    });

    return null;
  },
});

/** Coach-only: recent weekly reports, latest first. */
export const list = query({
  args: {},
  returns: v.object({
    reports: v.array(
      v.object({
        _id: v.id("reports"),
        weekStart: v.string(),
        payloadJson: v.string(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_week_start")
      .order("desc")
      .take(12);
    return { reports };
  },
});
