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
 * Overall training progress = average of the student's stroke skill
 * progress values. Returns null when no skill records exist
 * ("no progress recorded yet" instead of a misleading 0%).
 */
export async function overallProgress(
  ctx: QueryCtx,
  studentId: Id<"students">,
): Promise<number | null> {
  const skills = await ctx.db
    .query("strokeSkills")
    .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
    .take(100);
  if (skills.length === 0) return null;
  const sum = skills.reduce((acc, s) => acc + s.progress, 0);
  return Math.round(sum / skills.length);
}
