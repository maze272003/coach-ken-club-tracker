// convex/lib/flags.ts
import { daysBetween, monthKey, monthKeysBack } from "./time";

export const CONSECUTIVE_MISS_MIN = 2;
export const ATTENDANCE_DROP_POINTS = 15;
export const ATTENDANCE_DROP_MIN_RECORDS = 3;
export const PLATEAU_MIN_RESULTS = 3;
export const PLATEAU_WEEKS = 8;
export const GOAL_DEADLINE_DAYS = 14;
export const INACTIVE_DAYS = 21;

export type FlagKind =
  | "consecutive_misses"
  | "attendance_drop"
  | "plateau"
  | "goal_deadline"
  | "inactive";

export type FlagSeverity = "high" | "medium" | "low";

export const SEVERITY_ORDER: Record<FlagSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export type Flag = { kind: FlagKind; severity: FlagSeverity; detail: string };

export type AttendanceLike = {
  date: string;
  status: "present" | "late" | "absent";
};

function pct(records: AttendanceLike[]): number | null {
  if (records.length === 0) return null;
  const attended = records.filter((r) => r.status !== "absent").length;
  return Math.round((attended / records.length) * 100);
}

/** `recordsDesc` must be sorted by date descending. */
export function consecutiveMissesFlag(
  recordsDesc: AttendanceLike[],
): Flag | null {
  if (recordsDesc.length === 0 || recordsDesc[0]!.status !== "absent") {
    return null;
  }
  let streak = 0;
  for (const r of recordsDesc) {
    if (r.status !== "absent") break;
    streak += 1;
  }
  if (streak < CONSECUTIVE_MISS_MIN) return null;
  return {
    kind: "consecutive_misses",
    severity: "high",
    detail: `${streak} absences in a row (latest ${recordsDesc[0]!.date})`,
  };
}

/** `recordsDesc` must be sorted by date descending. */
export function attendanceDropFlag(
  recordsDesc: AttendanceLike[],
  today: string,
): Flag | null {
  const [lastMonth, thisMonth] = monthKeysBack(2, today);
  const current = recordsDesc.filter((r) => monthKey(r.date) === thisMonth);
  if (current.length < ATTENDANCE_DROP_MIN_RECORDS) return null;
  const previous = recordsDesc.filter((r) => monthKey(r.date) === lastMonth);
  const currentPct = pct(current);
  const previousPct = pct(previous);
  if (currentPct === null || previousPct === null) return null;
  const drop = previousPct - currentPct;
  if (drop < ATTENDANCE_DROP_POINTS) return null;
  return {
    kind: "attendance_drop",
    severity: "medium",
    detail: `attendance down ${drop} points (${previousPct}% to ${currentPct}% vs last month)`,
  };
}

export type EventHistory = {
  stroke: string;
  distanceMeters: number;
  course: "short" | "long";
  results: { date: string; timeMs: number }[];
};

export function plateauFlag(events: EventHistory[], today: string): Flag | null {
  let worst: { label: string; weeks: number } | null = null;
  for (const event of events) {
    if (event.results.length < PLATEAU_MIN_RESULTS) continue;
    const best = event.results.reduce((a, b) => (b.timeMs < a.timeMs ? b : a));
    const weeks = Math.floor(daysBetween(best.date, today) / 7);
    if (weeks < PLATEAU_WEEKS) continue;
    const label = `${event.distanceMeters}m ${event.stroke} (${event.course === "short" ? "SC" : "LC"})`;
    if (worst === null || weeks > worst.weeks) worst = { label, weeks };
  }
  if (worst === null) return null;
  return {
    kind: "plateau",
    severity: "low",
    detail: `no PB on ${worst.label} for ${worst.weeks} weeks`,
  };
}

export type GoalLike = {
  title: string;
  targetDate?: string;
  status: string;
};

export function goalDeadlineFlag(goals: GoalLike[], today: string): Flag | null {
  let soonest: { title: string; days: number } | null = null;
  for (const goal of goals) {
    if (goal.status === "completed" || goal.status === "archived") continue;
    if (!goal.targetDate) continue;
    const days = daysBetween(today, goal.targetDate);
    if (days < 0 || days > GOAL_DEADLINE_DAYS) continue;
    if (soonest === null || days < soonest.days) soonest = { title: goal.title, days };
  }
  if (soonest === null) return null;
  return {
    kind: "goal_deadline",
    severity: "medium",
    detail: `goal "${soonest.title}" due in ${soonest.days} day${soonest.days === 1 ? "" : "s"}`,
  };
}

export function inactiveFlag(
  lastSessionDate: string | null,
  today: string,
  recordAgeDays: number,
): Flag | null {
  if (recordAgeDays < INACTIVE_DAYS) return null;
  const idleDays =
    lastSessionDate === null ? recordAgeDays : daysBetween(lastSessionDate, today);
  if (idleDays < INACTIVE_DAYS) return null;
  return {
    kind: "inactive",
    severity: "medium",
    detail: `no training session in ${idleDays} days`,
  };
}
