// convex/lib/kpis.ts
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Counts new personal bests achieved in the target month: a result
 * strictly faster than every earlier result for the same event.
 * One bounded indexed read per student.
 */
export async function pbsInMonth(
  ctx: QueryCtx,
  studentId: Id<"students">,
  targetMonth: string,
): Promise<number> {
  const results = await ctx.db
    .query("timeResults")
    .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
    .take(500);
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const bestByKey = new Map<string, number>();
  let count = 0;
  for (const result of sorted) {
    const key = `${result.stroke}-${result.distanceMeters}-${result.course}`;
    const prior = bestByKey.get(key);
    if (prior === undefined) {
      bestByKey.set(key, result.timeMs);
      continue;
    }
    if (result.timeMs < prior && result.date.slice(0, 7) === targetMonth) {
      count += 1;
    }
    bestByKey.set(key, Math.min(prior, result.timeMs));
  }
  return count;
}
