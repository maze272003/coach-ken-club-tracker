import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type AttendanceStats = {
  total: number;
  attended: number;
  present: number;
  late: number;
  absent: number;
  percentage: number | null;
};

/**
 * Attendance percentage is always derived from the records:
 * attended = present + late, total = all recorded sessions.
 */
export async function attendanceStats(
  ctx: QueryCtx,
  studentId: Id<"students">,
): Promise<AttendanceStats> {
  const records = await ctx.db
    .query("attendance")
    .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
    .take(10000);
  const present = records.filter((r) => r.status === "present").length;
  const late = records.filter((r) => r.status === "late").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const attended = present + late;
  return {
    total: records.length,
    attended,
    present,
    late,
    absent,
    percentage:
      records.length === 0
        ? null
        : Math.round((attended / records.length) * 100),
  };
}

/**
 * Overall training progress = average of the student's skill progress
 * values across ACTIVE skills only (archived skill programs stop
 * counting). Returns null when there is nothing to average.
 */
export async function overallProgress(
  ctx: QueryCtx,
  studentId: Id<"students">,
): Promise<number | null> {
  const [skills, catalog] = await Promise.all([
    ctx.db
      .query("strokeSkills")
      .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
      .take(100),
    ctx.db.query("skills").withIndex("by_key").take(500),
  ]);
  const activeKeys = new Set(
    catalog.filter((s) => s.status === "active").map((s) => s.key),
  );
  const relevant = skills.filter((s) => activeKeys.has(s.stroke));
  if (relevant.length === 0) return null;
  const sum = relevant.reduce((acc, s) => acc + s.progress, 0);
  return Math.round(sum / relevant.length);
}

export type CommitmentStats = {
  held: number;
  attended: number;
  percentage: number | null;
};

/**
 * Commitment = attended (present/late) ÷ completed group practices
 * since the swimmer's join date. Null when the swimmer has no group.
 * Legacy record-based attendance stats are unaffected.
 */
export async function commitmentStats(
  ctx: QueryCtx,
  studentId: Id<"students">,
): Promise<CommitmentStats | null> {
  const student = await ctx.db.get("students", studentId);
  if (!student?.groupId) return null;
  const groupId = student.groupId;
  const practices = await ctx.db
    .query("practices")
    .withIndex("by_group_and_date", (q) => q.eq("groupId", groupId))
    .take(500);
  const fromDate = student.joinedAt ?? null;
  let held = 0;
  let attended = 0;
  for (const practice of practices) {
    if (practice.status !== "completed") continue;
    if (fromDate !== null && practice.date < fromDate) continue;
    held += 1;
    const record = await ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) =>
        q.eq("studentId", studentId).eq("date", practice.date),
      )
      .unique();
    if (record !== null && record.status !== "absent") attended += 1;
  }
  return {
    held,
    attended,
    percentage: held === 0 ? null : Math.round((attended / held) * 100),
  };
}

/**
 * Dynamically derives goal progress for time, attendance, and manual goals.
 */
export async function deriveGoalProgress(
  ctx: QueryCtx,
  goal: {
    studentId: Id<"students">;
    type?: "manual" | "time" | "attendance";
    distanceMeters?: number;
    stroke?: string;
    course?: "short" | "long";
    targetTimeMs?: number;
    baselineBestMs?: number;
    targetAttendancePct?: number;
    progress: number;
    status: "not_started" | "in_progress" | "completed" | "archived";
    targetDate?: string;
  },
): Promise<{
  progress: number;
  status: "not_started" | "in_progress" | "completed" | "archived";
  currentBestMs: number | null;
  currentAttendancePct: number | null;
}> {
  if (goal.status === "archived") {
    return {
      progress: goal.progress,
      status: "archived",
      currentBestMs: null,
      currentAttendancePct: null,
    };
  }

  const type = goal.type ?? "manual";

  if (type === "time") {
    if (
      !goal.stroke ||
      !goal.distanceMeters ||
      !goal.course ||
      !goal.targetTimeMs
    ) {
      return {
        progress: goal.progress,
        status: goal.status,
        currentBestMs: null,
        currentAttendancePct: null,
      };
    }

    const times = await ctx.db
      .query("timeResults")
      .withIndex("by_student_and_event", (q) =>
        q
          .eq("studentId", goal.studentId)
          .eq("stroke", goal.stroke!)
          .eq("distanceMeters", goal.distanceMeters!)
          .eq("course", goal.course!),
      )
      .take(500);

    if (times.length === 0) {
      return {
        progress: 0,
        status: "in_progress",
        currentBestMs: null,
        currentAttendancePct: null,
      };
    }

    const currentBestMs = Math.min(...times.map((t) => t.timeMs));
    if (currentBestMs <= goal.targetTimeMs) {
      return {
        progress: 100,
        status: "completed",
        currentBestMs,
        currentAttendancePct: null,
      };
    }

    const baseline = goal.baselineBestMs ?? currentBestMs;
    if (baseline <= goal.targetTimeMs) {
      return {
        progress: 100,
        status: "completed",
        currentBestMs,
        currentAttendancePct: null,
      };
    }

    const rawPct =
      ((baseline - currentBestMs) / (baseline - goal.targetTimeMs)) * 100;
    const progress = Math.min(100, Math.max(0, Math.round(rawPct)));
    return {
      progress,
      status: progress >= 100 ? "completed" : "in_progress",
      currentBestMs,
      currentAttendancePct: null,
    };
  }

  if (type === "attendance") {
    if (!goal.targetAttendancePct) {
      return {
        progress: goal.progress,
        status: goal.status,
        currentBestMs: null,
        currentAttendancePct: null,
      };
    }

    const stats = await attendanceStats(ctx, goal.studentId);
    if (stats.percentage === null) {
      return {
        progress: 0,
        status: "in_progress",
        currentBestMs: null,
        currentAttendancePct: null,
      };
    }

    const currentAttendancePct = stats.percentage;
    if (currentAttendancePct >= goal.targetAttendancePct) {
      return {
        progress: 100,
        status: "completed",
        currentBestMs: null,
        currentAttendancePct,
      };
    }

    const rawPct = (currentAttendancePct / goal.targetAttendancePct) * 100;
    const progress = Math.min(100, Math.max(0, Math.round(rawPct)));
    return {
      progress,
      status: progress >= 100 ? "completed" : "in_progress",
      currentBestMs: null,
      currentAttendancePct,
    };
  }


  // Manual goal
  return {
    progress: goal.progress,
    status: goal.progress >= 100 ? "completed" : goal.status,
    currentBestMs: null,
    currentAttendancePct: null,
  };
}

