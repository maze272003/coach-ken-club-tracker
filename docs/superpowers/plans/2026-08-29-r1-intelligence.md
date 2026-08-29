# R1 Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the R1 "Intelligence" release from `docs/superpowers/specs/2026-08-29-complete-remaining-surface-r1-r4-design.md`: M8 attention flags, S1 trends & charts, S2 weekly auto-report + athlete report card, S3 coach dashboard v2, on the timezone foundation.

**Architecture:** New `convex/lib/time.ts` (all coach-timezone date logic), `convex/lib/flags.ts` (pure flag evaluators), `convex/insights.ts` (flags collector + trends queries), `convex/reports.ts` + `convex/crons.ts` (weekly report machinery), `reports` table in schema, `convex/lib/kpis.ts` (bounded KPI helpers). UI: recharts chart components, Needs Attention card, Trends tab, reports pages, dashboard v2 restructure.

**Tech Stack:** Next.js 16 App Router, TypeScript, Convex, convex-test + vitest, recharts (new dependency), shadcn/ui, Tailwind.

## Global Constraints

- Coach timezone: `COACH_TZ = "Asia/Manila"` (UTC+8, no DST) — every "today"/week/month computation goes through `convex/lib/time.ts`, never raw server-local date logic.
- Weekly report cron: Sunday 22:00 UTC (= Monday 06:00 Asia/Manila).
- Flag thresholds (verbatim from spec): `CONSECUTIVE_MISS_MIN=2`, `ATTENDANCE_DROP_POINTS=15`, `ATTENDANCE_DROP_MIN_RECORDS=3`, `PLATEAU_MIN_RESULTS=3`, `PLATEAU_WEEKS=8`, `GOAL_DEADLINE_DAYS=14`, `INACTIVE_DAYS=21`.
- Performance contract: new code uses indexed range scans bounded by date or take ≤500 per student; no whole-table scans. (Existing `attendanceStats` take(10000) stays untouched.)
- Auth: coach-only functions start with `requireCoach(ctx)` returning null → `throw new ConvexError("Not authorized")`; student functions use `requireStudent(ctx)`. Never trust client ids.
- Gates after every task: `npm run typecheck` and `npm test` must pass (Task 12 temporarily breaks dashboard-page typecheck until Task 13 lands — noted there); run `npm run lint` before each commit.
- Test style: vitest + `convexTest(schema, modules)`, `seedCoach`/`seedStudent` from `./tests/helpers`, `/// <reference types="vite/client" />` first line.
- Dates are "YYYY-MM-DD" strings; months "YYYY-MM".
- Commit style: `feat(scope): ...` / `test(scope): ...` matching `git log --oneline`.

---

### Task 1: Timezone helpers (`convex/lib/time.ts`)

**Files:**
- Create: `convex/lib/time.ts`
- Test: `convex/time.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 3, 5, 8, 9, 12): `COACH_TZ`, `todayInCoachTz(now?: Date): string`, `datePlusDays(date, days): string`, `daysBetween(from, to): number`, `weekStartIso(date): string` (Monday), `monthKey(date): string`, `monthKeysBack(count, from): string[]` (ascending), `weekStartsBack(count, from): string[]` (ascending).

- [ ] **Step 1: Write the failing tests**

```ts
// convex/time.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  COACH_TZ,
  datePlusDays,
  daysBetween,
  monthKey,
  monthKeysBack,
  todayInCoachTz,
  weekStartIso,
  weekStartsBack,
} from "./lib/time";

describe("coach timezone helpers", () => {
  it("converts UTC instants to Asia/Manila calendar days", () => {
    expect(COACH_TZ).toBe("Asia/Manila");
    expect(todayInCoachTz(new Date("2026-08-29T15:59:00Z"))).toBe("2026-08-29");
    expect(todayInCoachTz(new Date("2026-08-29T16:00:00Z"))).toBe("2026-08-30");
  });

  it("does calendar math without timezone drift", () => {
    expect(datePlusDays("2026-08-29", 1)).toBe("2026-08-30");
    expect(datePlusDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(datePlusDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-08-01", "2026-08-29")).toBe(28);
    expect(daysBetween("2026-08-29", "2026-08-01")).toBe(-28);
  });

  it("finds the Monday of the week (2026-08-29 is a Saturday)", () => {
    expect(weekStartIso("2026-08-29")).toBe("2026-08-24");
    expect(weekStartIso("2026-08-24")).toBe("2026-08-24");
    expect(weekStartIso("2026-08-30")).toBe("2026-08-24");
  });

  it("keys months and walks month/week ladders", () => {
    expect(monthKey("2026-08-29")).toBe("2026-08");
    expect(monthKeysBack(3, "2026-08-15")).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(weekStartsBack(2, "2026-08-29")).toEqual(["2026-08-17", "2026-08-24"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/time.test.ts`
Expected: FAIL — cannot resolve `./lib/time`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/time.ts
/**
 * All coach-local calendar logic. Convex functions run in UTC; the
 * coach operates in Asia/Manila (UTC+8, no DST). "Today", week
 * starts (Monday), and month keys always flow through this module.
 */
export const COACH_TZ = "Asia/Manila";

function ymdInTz(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COACH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayInCoachTz(now: Date = new Date()): string {
  return ymdInTz(now);
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function datePlusDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * 86_400_000));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function weekStartIso(date: string): string {
  const dow = toUtc(date).getUTCDay(); // 0 = Sunday
  return datePlusDays(date, -((dow + 6) % 7));
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** The last `count` month keys ending at `from`'s month, ascending. */
export function monthKeysBack(count: number, from: string): string[] {
  const d = toUtc(from);
  d.setUTCDate(1);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return keys.reverse();
}

/** The last `count` Monday week-starts ending at `from`'s week, ascending. */
export function weekStartsBack(count: number, from: string): string[] {
  const keys: string[] = [];
  let cursor = weekStartIso(from);
  for (let i = 0; i < count; i++) {
    keys.push(cursor);
    cursor = datePlusDays(cursor, -7);
  }
  return keys.reverse();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/time.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/time.ts convex/time.test.ts
git commit -m "feat(time): coach-timezone date helpers with week and month ladders"
```

---

### Task 2: Flag rule evaluators (`convex/lib/flags.ts`)

**Files:**
- Create: `convex/lib/flags.ts`
- Test: `convex/flags.test.ts`

**Interfaces:**
- Consumes: `daysBetween`, `monthKey`, `monthKeysBack` from `./lib/time` (Task 1).
- Produces (used by Tasks 3, 9): `Flag = { kind: FlagKind; severity: FlagSeverity; detail: string }`; threshold constants (Global Constraints); pure functions `consecutiveMissesFlag(recordsDesc)`, `attendanceDropFlag(recordsDesc, today)`, `plateauFlag(events, today)`, `goalDeadlineFlag(goals, today)`, `inactiveFlag(lastSessionDate, today, recordAgeDays)` — each `Flag | null`. `recordsDesc` = attendance sorted date-descending. `SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }`.

- [ ] **Step 1: Write the failing tests**

```ts
// convex/flags.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  attendanceDropFlag,
  consecutiveMissesFlag,
  goalDeadlineFlag,
  inactiveFlag,
  plateauFlag,
} from "./lib/flags";

const TODAY = "2026-08-29";

function att(date: string, status: "present" | "late" | "absent") {
  return { date, status };
}

describe("flag evaluators at exact thresholds", () => {
  it("consecutive_misses: fires at 2 trailing absences, not 1, and not when latest is present", () => {
    const two = consecutiveMissesFlag([
      att("2026-08-28", "absent"),
      att("2026-08-27", "absent"),
      att("2026-08-26", "present"),
    ]);
    expect(two?.kind).toBe("consecutive_misses");
    expect(two?.severity).toBe("high");

    const one = consecutiveMissesFlag([
      att("2026-08-28", "absent"),
      att("2026-08-27", "present"),
    ]);
    expect(one).toBeNull();

    const latestPresent = consecutiveMissesFlag([
      att("2026-08-28", "present"),
      att("2026-08-27", "absent"),
      att("2026-08-26", "absent"),
    ]);
    expect(latestPresent).toBeNull();
  });

  it("attendance_drop: fires on a large drop, stays quiet at exactly 14 points or with <3 records", () => {
    const fires = attendanceDropFlag(
      [
        // This month: 3 records, 1 attended = 33%
        att("2026-08-20", "absent"),
        att("2026-08-13", "absent"),
        att("2026-08-06", "present"),
        // Last month: 3/3 = 100%
        att("2026-07-20", "present"),
        att("2026-07-13", "present"),
        att("2026-07-06", "present"),
      ],
      TODAY,
    );
    expect(fires?.kind).toBe("attendance_drop");
    expect(fires?.severity).toBe("medium");

    // Exactly 14 points: this month 86% (6/7), last month 100% (3/3) -> quiet.
    const exact14 = attendanceDropFlag(
      [
        att("2026-08-28", "present"),
        att("2026-08-27", "present"),
        att("2026-08-26", "present"),
        att("2026-08-25", "present"),
        att("2026-08-24", "present"),
        att("2026-08-23", "present"),
        att("2026-08-22", "absent"),
        att("2026-07-30", "present"),
        att("2026-07-23", "present"),
        att("2026-07-16", "present"),
      ],
      TODAY,
    );
    expect(exact14).toBeNull();

    // Only 2 records this month -> quiet even at 0%.
    const tooFew = attendanceDropFlag(
      [
        att("2026-08-20", "absent"),
        att("2026-08-13", "absent"),
        att("2026-07-20", "present"),
        att("2026-07-13", "present"),
      ],
      TODAY,
    );
    expect(tooFew).toBeNull();
  });

  it("plateau: fires when the PB of a >=3-result event is older than 8 weeks", () => {
    const staleEvent = {
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short" as const,
      results: [
        { date: "2026-01-05", timeMs: 32000 },
        { date: "2026-04-01", timeMs: 30000 }, // PB, ~20 weeks before TODAY
        { date: "2026-05-20", timeMs: 31000 },
      ],
    };
    const freshEvent = {
      stroke: "backstroke",
      distanceMeters: 100,
      course: "short" as const,
      results: [
        { date: "2026-08-10", timeMs: 75000 },
        { date: "2026-08-20", timeMs: 74000 }, // fresh PB
      ],
    };

    const flag = plateauFlag([staleEvent, freshEvent], TODAY);
    expect(flag?.kind).toBe("plateau");
    expect(flag?.severity).toBe("low");
    expect(flag?.detail).toContain("50m freestyle");

    // 2-result events never plateau.
    expect(plateauFlag([freshEvent], TODAY)).toBeNull();

    // 7-week-old PB (day 49) stays quiet: PB exactly 8 weeks ago (Jul 4).
    const week7 = {
      stroke: "freestyle",
      distanceMeters: 100,
      course: "short" as const,
      results: [
        { date: "2026-05-01", timeMs: 70000 },
        { date: "2026-07-11", timeMs: 69000 }, // 49 days = 7 weeks before TODAY
        { date: "2026-08-01", timeMs: 69500 },
      ],
    };
    expect(plateauFlag([week7], TODAY)).toBeNull();
  });

  it("goal_deadline: fires within 14 days, not at 15 or in the past", () => {
    const goals = [
      { title: "Sub-30 50m", targetDate: "2026-09-05", status: "in_progress" },
      { title: "Old goal", targetDate: "2026-08-01", status: "in_progress" },
      { title: "Far goal", targetDate: "2026-10-30", status: "in_progress" },
      { title: "Done goal", targetDate: "2026-08-30", status: "completed" },
    ];
    const flag = goalDeadlineFlag(goals, TODAY);
    expect(flag?.kind).toBe("goal_deadline");
    expect(flag?.detail).toContain("Sub-30 50m");

    expect(
      goalDeadlineFlag(
        [{ title: "Far", targetDate: "2026-09-13", status: "in_progress" }],
        TODAY,
      ),
    ).toBeNull(); // day 15
  });

  it("inactive: fires at 21 days without a session, respects record age", () => {
    expect(inactiveFlag("2026-08-08", TODAY, 400)?.kind).toBe("inactive"); // 21 days idle
    expect(inactiveFlag("2026-08-09", TODAY, 400)).toBeNull(); // 20 days
    expect(inactiveFlag(null, TODAY, 400)?.kind).toBe("inactive"); // never trained
    expect(inactiveFlag(null, TODAY, 20)).toBeNull(); // student too new
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/flags.test.ts`
Expected: FAIL — cannot resolve `./lib/flags`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/flags.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/flags.ts convex/flags.test.ts
git commit -m "feat(flags): pure attention-flag evaluators with threshold tests"
```

---

### Task 3: Attention flags query (`convex/insights.ts`)

**Files:**
- Create: `convex/insights.ts`
- Test: `convex/insights-flags.test.ts`

**Interfaces:**
- Consumes: evaluators from `./lib/flags` (Task 2), `todayInCoachTz`, `daysBetween` from `./lib/time` (Task 1), `requireCoach` from `./lib/access`.
- Produces: query `api.insights.coachAttentionFlags` → `{ flags: Array<{ studentId, studentName, kind, severity, detail }> }` sorted by severity then name; exported helper `collectStudentFlags(ctx, student, today): Promise<Flag[]>` (reused by Task 9's cron). Reads per student: 30 attendance rows, 500 time results, 50 goals, 1 latest session.

- [ ] **Step 1: Write the failing test**

```ts
// convex/insights-flags.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { todayInCoachTz, datePlusDays } from "./lib/time";

describe("coachAttentionFlags", () => {
  it("rejects anonymous and student callers", async () => {
    const t = convexTest(schema, modules);
    const { userId: studentUserId } = await seedStudent(t, "Alex Santos");

    await expect(
      t.withIdentity({ subject: studentUserId }).query(api.insights.coachAttentionFlags, {}),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.query(api.insights.coachAttentionFlags, {}),
    ).rejects.toThrow("Not authorized");
  });

  it("flags consecutive misses and inactivity, sorted by severity", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const today = todayInCoachTz();
    const { studentId: streaker } = await seedStudent(t, "Maria Reyes");
    const { studentId: idle } = await seedStudent(t, "Old Swimmer");

    await t.run(async (ctx) => {
      for (const offset of [1, 2]) {
        await ctx.db.insert("attendance", {
          studentId: streaker,
          date: datePlusDays(today, -offset),
          status: "absent",
          updatedAt: Date.now(),
        });
      }
      await ctx.db.patch(idle, { joinedAt: datePlusDays(today, -40) });
    });

    const result = await t
      .withIdentity({ subject: coachId })
      .query(api.insights.coachAttentionFlags, {});

    const kinds = result.flags.map((f) => `${f.studentName}:${f.kind}`);
    expect(kinds).toContain("Maria Reyes:consecutive_misses");
    expect(kinds).toContain("Old Swimmer:inactive");
    expect(result.flags[0]!.kind).toBe("consecutive_misses");
  });

  it("returns an empty list when nobody needs attention", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Fresh Swimmer");
    const today = todayInCoachTz();
    await t.run(async (ctx) => {
      await ctx.db.insert("attendance", {
        studentId,
        date: datePlusDays(today, -1),
        status: "present",
        updatedAt: Date.now(),
      });
    });
    const result = await t
      .withIdentity({ subject: coachId })
      .query(api.insights.coachAttentionFlags, {});
    expect(result.flags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/insights-flags.test.ts`
Expected: FAIL — `api.insights` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/insights-flags.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/insights.ts convex/insights-flags.test.ts
git commit -m "feat(insights): coach attention flags query (M8)"
```

---

### Task 4: Needs Attention card (M8 UI)

**Files:**
- Create: `components/coach/needs-attention-card.tsx`
- Modify: `app/coach/dashboard/page.tsx` (insert card after the "Today's Practices" `<Card>` block, before the `lg:grid-cols-3` grid)

**Interfaces:**
- Consumes: `api.insights.coachAttentionFlags` (Task 3).
- Produces: `<NeedsAttentionCard />` — no props; repositioned by Task 13.

- [ ] **Step 1: Create the component**

```tsx
// components/coach/needs-attention-card.tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const severityStyles: Record<string, string> = {
  high: "bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400",
  low: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400",
};

export function NeedsAttentionCard() {
  const result = useQuery(api.insights.coachAttentionFlags, {});

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
          Needs Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {result === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : result.flags.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nobody needs attention right now"
            description="Flags appear here for absences, attendance drops, plateaus, goal deadlines, and inactivity."
            className="border-0 py-6"
          />
        ) : (
          <ul className="divide-y">
            {result.flags.map((flag, i) => (
              <li key={i}>
                <Link
                  href={`/coach/students/${flag.studentId}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{flag.studentName}</p>
                    <p className="text-sm text-muted-foreground">{flag.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        severityStyles[flag.severity] ?? severityStyles.low
                      }`}
                    >
                      {flag.severity}
                    </span>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Insert into the current dashboard**

In `app/coach/dashboard/page.tsx`, add the import:

```tsx
import { NeedsAttentionCard } from "@/components/coach/needs-attention-card";
```

Insert immediately after the closing `</Card>` of the "Today's Practices" card (before `<div className="grid gap-4 lg:grid-cols-3">`):

```tsx
      <NeedsAttentionCard />
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass. Manual check (`npm run dev`, sign in as coach): card renders with data or the empty state.

```bash
git add components/coach/needs-attention-card.tsx app/coach/dashboard/page.tsx
git commit -m "feat(coach): needs attention card on dashboard (M8 UI)"
```

---

### Task 5: Trends aggregate queries (S1 backend)

**Files:**
- Modify: `convex/insights.ts` (append queries)
- Test: `convex/insights-trends.test.ts`

**Interfaces:**
- Consumes: `monthKeysBack`, `weekStartIso`, `weekStartsBack`, `todayInCoachTz` from `./lib/time`; `requireCoach`, `requireStudent`, `resolveStudentAccess` from `./lib/access`.
- Produces: `api.insights.studentTrends({ studentId })` (coach), `api.insights.myTrends()` (student), both returning `{ attendanceByMonth: {label, value:number|null}[] (6), volumeByWeek: {label, value:number|null}[] (12), skillRadar: {label, value:number}[], pbProgression: {label, points:{date,timeMs}[]}[] }`; `api.insights.teamTrends()` (coach) returning `{ attendanceByMonth (6), volumeByGroup: {label, value:number}[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/insights-trends.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { datePlusDays, todayInCoachTz } from "./lib/time";

describe("trends queries", () => {
  it("rejects non-coach callers for studentTrends and teamTrends", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedStudent(t, "Alex Santos");
    await expect(
      t.withIdentity({ subject: userId }).query(api.insights.studentTrends, {
        studentId: "k57abc123" as never,
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.withIdentity({ subject: userId }).query(api.insights.teamTrends, {}),
    ).rejects.toThrow("Not authorized");
  });

  it("builds volume weeks with nulls for missing distance data", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Alex Santos");
    const today = todayInCoachTz();

    await t.run(async (ctx) => {
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: today,
        title: "Distance day",
        durationMinutes: 60,
        distanceMeters: 2000,
        strokes: ["freestyle"],
        updatedAt: Date.now(),
      });
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: datePlusDays(today, -7),
        title: "Technique only",
        durationMinutes: 45,
        strokes: ["backstroke"],
        updatedAt: Date.now(),
      });
    });

    const trends = await t
      .withIdentity({ subject: coachId })
      .query(api.insights.studentTrends, { studentId });

    expect(trends.volumeByWeek).toHaveLength(12);
    expect(trends.volumeByWeek[11]!.value).toBe(2000);
    expect(trends.volumeByWeek[10]!.value).toBeNull();
  });

  it("myTrends serves the signed-in student their own pb progression", async () => {
    const t = convexTest(schema, modules);
    const { userId, studentId } = await seedStudent(t, "Alex Santos");
    const today = todayInCoachTz();

    await t.run(async (ctx) => {
      for (const [offset, timeMs] of [
        [-21, 32000],
        [-14, 31000],
        [-7, 30500],
      ] as const) {
        await ctx.db.insert("timeResults", {
          studentId,
          date: datePlusDays(today, offset),
          distanceMeters: 50,
          stroke: "freestyle",
          course: "short",
          timeMs,
          context: "practice",
          updatedAt: Date.now(),
        });
      }
    });

    const mine = await t
      .withIdentity({ subject: userId })
      .query(api.insights.myTrends, {});

    expect(mine.pbProgression).toHaveLength(1);
    expect(mine.pbProgression[0]!.label).toContain("50m freestyle");
    expect(mine.pbProgression[0]!.points.map((p) => p.timeMs)).toEqual([
      32000, 31000, 30500,
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/insights-trends.test.ts`
Expected: FAIL — `studentTrends`/`myTrends` do not exist.

- [ ] **Step 3: Append the implementation to `convex/insights.ts`**

Extend the imports at the top (merge with existing):

```ts
import { monthKeysBack, weekStartIso, weekStartsBack } from "./lib/time";
import { requireStudent, resolveStudentAccess } from "./lib/access";
```

Append to `convex/insights.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/insights-trends.test.ts`
Expected: PASS (3 tests). Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add convex/insights.ts convex/insights-trends.test.ts
git commit -m "feat(insights): trends aggregate queries for charts (S1 backend)"
```

---

### Task 6: Chart components (recharts)

**Files:**
- Modify: `package.json` (new dependency)
- Create: `components/shared/charts.tsx`

**Interfaces:**
- Consumes: trends data shapes from Task 5.
- Produces: `AttendanceBarChart({ data: Point[] })`, `VolumeLineChart({ data: Point[] })`, `SkillRadarChart({ data: {label, value}[] })`, `PbProgressionChart({ points: {date, timeMs}[] })`, `type Point = { label: string; value: number | null }`.

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Create the chart components**

```tsx
// components/shared/charts.tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type Point = { label: string; value: number | null };

const axisProps = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 12,
  tickLine: false,
} as const;

export function AttendanceBarChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} />
        <Tooltip formatter={(value) => (value === null ? "no records" : `${value}%`)} />
        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VolumeLineChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} />
        <Tooltip
          formatter={(value) =>
            value === null ? "no distance data" : `${Number(value).toLocaleString()} m`
          }
        />
        <Line
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          connectNulls
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SkillRadarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
        <Radar
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.35}
        />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function PbProgressionChart({
  points,
}: {
  points: { date: string; timeMs: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...axisProps} />
        <YAxis domain={["auto", "auto"]} reversed {...axisProps} />
        <Tooltip />
        <Line dataKey="timeMs" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add package.json package-lock.json components/shared/charts.tsx
git commit -m "feat(charts): recharts chart components (S1)"
```

---

### Task 7: Trends UI (coach student tab + student training page)

**Files:**
- Create: `components/coach/student-trends-tab.tsx`
- Create: `components/student/my-trends-section.tsx`
- Modify: `app/coach/students/[id]/page.tsx` (add Trends tab)
- Modify: `app/student/training/page.tsx` (embed own trends)

**Interfaces:**
- Consumes: `api.insights.studentTrends`, `api.insights.myTrends` (Task 5), chart components (Task 6).
- Produces: `<StudentTrendsTab studentId>` and `<MyTrendsSection />`.

- [ ] **Step 1: Create the coach Trends tab component**

```tsx
// components/coach/student-trends-tab.tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { LineChart } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  AttendanceBarChart,
  PbProgressionChart,
  SkillRadarChart,
  VolumeLineChart,
} from "@/components/shared/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function StudentTrendsTab({ studentId }: { studentId: string }) {
  const trends = useQuery(api.insights.studentTrends, {
    studentId: studentId as never,
  });
  const [eventLabel, setEventLabel] = useState<string>("");

  if (trends === undefined) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const selected =
    trends.pbProgression.find((e) => e.label === eventLabel) ??
    trends.pbProgression[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Attendance by month (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceBarChart data={trends.attendanceByMonth} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Weekly volume (m)</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumeLineChart data={trends.volumeByWeek} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Skill levels</CardTitle>
          </CardHeader>
          <CardContent>
            {trends.skillRadar.length < 3 ? (
              <EmptyState
                icon={LineChart}
                title="Not enough skills yet"
                description="At least three skill assessments are needed for the radar."
                className="border-0 py-6"
              />
            ) : (
              <SkillRadarChart data={trends.skillRadar} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">PB progression</CardTitle>
            {trends.pbProgression.length > 0 && (
              <Select value={selected?.label ?? ""} onValueChange={(v) => setEventLabel(v)}>
                <SelectTrigger className="w-full" aria-label="Event">
                  <SelectValue placeholder="Event" />
                </SelectTrigger>
                <SelectContent>
                  {trends.pbProgression.map((event) => (
                    <SelectItem key={event.label} value={event.label}>
                      {event.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {selected ? (
              <PbProgressionChart points={selected.points} />
            ) : (
              <EmptyState
                icon={LineChart}
                title="No event history yet"
                description="Record at least two results for one event to see progression."
                className="border-0 py-6"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the student-owned trends section**

```tsx
// components/student/my-trends-section.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AttendanceBarChart, VolumeLineChart } from "@/components/shared/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MyTrendsSection() {
  const trends = useQuery(api.insights.myTrends, {});

  if (trends === undefined) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">My attendance (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceBarChart data={trends.attendanceByMonth} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">My weekly volume (m)</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumeLineChart data={trends.volumeByWeek} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Wire both pages**

In `app/coach/students/[id]/page.tsx`: add `import { StudentTrendsTab } from "@/components/coach/student-trends-tab";`, add `<TabsTrigger value="trends">Trends</TabsTrigger>` after the "Times & PBs" trigger (~line 232), and after the `times` TabsContent block (~line 284):

```tsx
        <TabsContent value="trends" className="mt-4">
          <StudentTrendsTab studentId={student.studentId} />
        </TabsContent>
```

In `app/student/training/page.tsx`: add `import { MyTrendsSection } from "@/components/student/my-trends-section";` and render `<MyTrendsSection />` after the page header, before the session list.

- [ ] **Step 4: Add the team volume chart to the Groups page**

In `app/coach/groups/page.tsx`, add `const teamTrends = useQuery(api.insights.teamTrends, {});` beside the existing `groups` query, plus imports:

```tsx
import { VolumeLineChart } from "@/components/shared/charts";
import { CardHeader, CardTitle } from "@/components/ui/card";
```

Then insert a team volume card after the `PageHeader` block (before the groups list `<Card>`):

```tsx
      {teamTrends !== undefined && teamTrends.volumeByGroup.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Volume by group (last 8 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <VolumeLineChart data={teamTrends.volumeByGroup} />
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. Manual: coach student detail shows a Trends tab; student training page shows two charts; Groups page shows the team volume chart when groups have volume.

```bash
git add components/coach/student-trends-tab.tsx components/student/my-trends-section.tsx "app/coach/students/[id]/page.tsx" app/student/training/page.tsx app/coach/groups/page.tsx
git commit -m "feat(trends): trends tab, student charts, and team volume chart (S1 UI)"
```

---

### Task 8: Reports table + athlete report card query (S2 backend)

**Files:**
- Modify: `convex/schema.ts` (add `reports` table)
- Create: `convex/reports.ts`
- Test: `convex/reports-card.test.ts`

**Interfaces:**
- Consumes: `attendanceStats`, `commitmentStats`, `deriveGoalProgress` from `./lib/stats`; `todayInCoachTz`, `weekStartIso`, `weekStartsBack` from `./lib/time`.
- Produces: `reports` table `{ weekStart: string, payloadJson: string, createdAt: number }` with index `by_week_start`; query `api.reports.athleteCard({ studentId })` (coach-only) returning the structured card (student header, groupName, attendance, commitment, volumeByWeek 12, skills, pbs, goals).

- [ ] **Step 1: Add the reports table to schema**

In `convex/schema.ts`, append after the `trainingGoals` table definition, before the closing `});`:

```ts
  reports: defineTable({
    weekStart: v.string(),
    payloadJson: v.string(),
    createdAt: v.number(),
  }).index("by_week_start", ["weekStart"]),
```

- [ ] **Step 2: Write the failing test**

```ts
// convex/reports-card.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("reports.athleteCard", () => {
  it("rejects students and anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedStudent(t, "Alex Santos");
    await expect(
      t.withIdentity({ subject: userId }).query(api.reports.athleteCard, {
        studentId: "k57abc123" as never,
      }),
    ).rejects.toThrow("Not authorized");
  });

  it("returns the full card for a swimmer with history", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Maria Reyes");

    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "Senior A",
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.patch(studentId, { groupId, joinedAt: "2026-01-15" });
      await ctx.db.insert("timeResults", {
        studentId,
        date: "2026-08-10",
        distanceMeters: 50,
        stroke: "freestyle",
        course: "short",
        timeMs: 29500,
        context: "meet",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("strokeSkills", {
        studentId,
        stroke: "freestyle",
        progress: 72,
        updatedAt: Date.now(),
      });
    });

    const card = await t
      .withIdentity({ subject: coachId })
      .query(api.reports.athleteCard, { studentId });

    expect(card.student.name).toBe("Maria Reyes");
    expect(card.groupName).toBe("Senior A");
    expect(card.pbs).toHaveLength(1);
    expect(card.pbs[0]!.bestTimeMs).toBe(29500);
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]!.progress).toBe(72);
    expect(card.volumeByWeek).toHaveLength(12);
    expect(card.commitment).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/reports-card.test.ts`
Expected: FAIL — `api.reports` does not exist.

- [ ] **Step 4: Create `convex/reports.ts`**

```ts
// convex/reports.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import {
  attendanceStats,
  commitmentStats,
  deriveGoalProgress,
} from "./lib/stats";
import { todayInCoachTz, weekStartIso, weekStartsBack } from "./lib/time";

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
      .filter((s) => activeNames.has(s.stroke))
      .map((s) => ({ name: activeNames.get(s.stroke)!, progress: s.progress }))
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
    const pbs = [...eventsMap.values()].sort((a, b) => a.label.localeCompare(b.label));

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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex/reports-card.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/reports.ts convex/reports-card.test.ts
git commit -m "feat(reports): reports table and athlete report card query (S2)"
```

---

### Task 9: Weekly report cron (S2 backend)

**Files:**
- Modify: `convex/reports.ts` (append `generateWeekly` internal mutation + `list` query)
- Create: `convex/crons.ts`
- Test: `convex/reports-weekly.test.ts`

**Interfaces:**
- Consumes: `collectStudentFlags` from `./insights` (Task 3), `todayInCoachTz`, `weekStartIso`, `datePlusDays` from `./lib/time`.
- Produces: internal mutation `internal.reports.generateWeekly` (no args, idempotent per week); query `api.reports.list` (coach-only) → `{ reports: Array<{ _id, weekStart, payloadJson, createdAt }> }` latest first, max 12. Cron: Sunday 22:00 UTC.

- [ ] **Step 1: Write the failing test**

```ts
// convex/reports-weekly.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";

describe("reports.generateWeekly", () => {
  it("writes one idempotent report covering the completed week", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    const today = todayInCoachTz();
    const weekStart = weekStartIso(datePlusDays(today, -1));
    const { studentId } = await seedStudent(t, "Alex Santos");

    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "Senior A",
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.patch(studentId, { groupId });
      await ctx.db.insert("practices", {
        groupId,
        date: datePlusDays(weekStart, 2),
        title: "Aerobic set",
        plannedDurationMinutes: 90,
        strokes: ["freestyle"],
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("attendance", {
        studentId,
        date: datePlusDays(weekStart, 2),
        status: "present",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: datePlusDays(weekStart, 2),
        title: "From practice: Aerobic set",
        durationMinutes: 90,
        distanceMeters: 3200,
        strokes: ["freestyle"],
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.reports.generateWeekly, {});
    await t.mutation(internal.reports.generateWeekly, {});

    const docs = await t.run(async (ctx) => {
      return await ctx.db.query("reports").collect();
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.weekStart).toBe(weekStart);

    const payload = JSON.parse(docs[0]!.payloadJson) as {
      team: { practicesHeld: number; volumeMeters: number };
      groups: Array<{ groupName: string; practicesHeld: number }>;
      errors: unknown[];
    };
    expect(payload.team.practicesHeld).toBe(1);
    expect(payload.team.volumeMeters).toBe(3200);
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0]!.groupName).toBe("Senior A");
    expect(payload.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/reports-weekly.test.ts`
Expected: FAIL — `internal.reports.generateWeekly` does not exist.

- [ ] **Step 3: Append the mutation and list query to `convex/reports.ts`**

Add imports (merged with existing):

```ts
import { internalMutation } from "./_generated/server";
import { collectStudentFlags } from "./insights";
import { datePlusDays } from "./lib/time";
```

Append:

```ts
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
    if (existing) await ctx.db.delete(existing._id);
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
```

- [ ] **Step 4: Create the cron registry**

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/server";

const crons = cronJobs();

// Monday 06:00 Asia/Manila == Sunday 22:00 UTC.
crons.weekly(
  "weekly-report",
  { dayOfWeek: "sunday", hourUTC: 22, minuteUTC: 0 },
  internal.reports.generateWeekly,
  {},
);

export default crons;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex/reports-weekly.test.ts`
Expected: PASS (1 test). Then `npm test` — full suite green.

- [ ] **Step 6: Commit**

```bash
git add convex/reports.ts convex/crons.ts convex/reports-weekly.test.ts
git commit -m "feat(reports): idempotent weekly report cron action and list query (S2)"
```

---

### Task 10: Reports page + nav + dashboard strip (S2 UI)

**Files:**
- Create: `app/coach/reports/page.tsx`
- Create: `components/coach/weekly-report-card.tsx`
- Modify: `app/coach/layout.tsx` (nav item)
- Modify: `app/coach/dashboard/page.tsx` (last-week strip)

**Interfaces:**
- Consumes: `api.reports.list` (Task 9).
- Produces: `/coach/reports` page; `<WeeklyReportCard payload>` + exported `WeeklyPayload` type.

- [ ] **Step 1: Create the report payload renderer**

```tsx
// components/coach/weekly-report-card.tsx
"use client";

import { CalendarCheck, ClipboardCheck, Flag, Timer, Waves } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

type GroupReport = {
  groupName: string;
  practicesHeld: number;
  attendancePct: number | null;
  volumeMeters: number;
  pbs: number;
  flagsRaised: number;
};

export type WeeklyPayload = {
  weekStart: string;
  team: {
    practicesHeld: number;
    attendancePct: number | null;
    volumeMeters: number;
    pbs: number;
    flagsRaised: number;
  };
  groups: GroupReport[];
  errors: { groupName: string; error: string }[];
};

export function WeeklyReportCard({ payload }: { payload: WeeklyPayload }) {
  const kpis = [
    { label: "Practices held", value: String(payload.team.practicesHeld) },
    {
      label: "Attendance",
      value:
        payload.team.attendancePct === null ? "—" : `${payload.team.attendancePct}%`,
    },
    { label: "Volume", value: `${payload.team.volumeMeters.toLocaleString()} m` },
    { label: "PBs", value: String(payload.team.pbs) },
    { label: "Flags raised", value: String(payload.team.flagsRaised) },
  ];

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Week of {formatDate(payload.weekStart)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
        {payload.groups.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Group</th>
                <th className="py-1.5 font-medium">Practices</th>
                <th className="py-1.5 font-medium">Attendance</th>
                <th className="py-1.5 font-medium">Volume</th>
                <th className="py-1.5 font-medium">PBs</th>
                <th className="py-1.5 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {payload.groups.map((group) => (
                <tr key={group.groupName} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{group.groupName}</td>
                  <td className="py-1.5 tabular-nums">{group.practicesHeld}</td>
                  <td className="py-1.5 tabular-nums">
                    {group.attendancePct === null ? "—" : `${group.attendancePct}%`}
                  </td>
                  <td className="py-1.5 tabular-nums">
                    {group.volumeMeters.toLocaleString()} m
                  </td>
                  <td className="py-1.5 tabular-nums">{group.pbs}</td>
                  <td className="py-1.5 tabular-nums">{group.flagsRaised}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {payload.errors.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {payload.errors.length} group(s) failed to compute:{" "}
            {payload.errors.map((e) => `${e.groupName} (${e.error})`).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the reports page**

```tsx
// app/coach/reports/page.tsx
"use client";

import { useQuery } from "convex/react";
import { FileText, Printer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  WeeklyReportCard,
  type WeeklyPayload,
} from "@/components/coach/weekly-report-card";

export default function CoachReportsPage() {
  const result = useQuery(api.reports.list, {});

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Weekly Reports"
        description="Auto-generated every Monday at 06:00."
        actions={
          <Button
            variant="outline"
            className="gap-2 print:hidden"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        }
      />

      {result === undefined ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : result.reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="The first report is generated at the next Monday 06:00 run."
        />
      ) : (
        <div className="space-y-6">
          {result.reports.map((report) => (
            <WeeklyReportCard
              key={report._id}
              payload={JSON.parse(report.payloadJson) as WeeklyPayload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add nav item and dashboard strip**

In `app/coach/layout.tsx`, insert after the Times entry (~line 12):

```ts
  { href: "/coach/reports", label: "Reports", icon: "FileText" },
```

In `app/coach/dashboard/page.tsx`: add `const reports = useQuery(api.reports.list, {});` beside the other queries, imports `FileText` (lucide-react) and `WeeklyReportCard` + `WeeklyPayload` from the new component, then insert after `<NeedsAttentionCard />`:

```tsx
      {reports !== undefined && reports.reports.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                Last week
              </span>
              <Link
                href="/coach/reports"
                className="text-sm underline text-muted-foreground hover:text-foreground"
              >
                All reports
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyReportCard
              payload={JSON.parse(reports.reports[0]!.payloadJson) as WeeklyPayload}
            />
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass. Manual: nav shows Reports; page renders the empty state (the cron itself is verified by Task 9's test).

```bash
git add app/coach/reports/page.tsx components/coach/weekly-report-card.tsx app/coach/layout.tsx app/coach/dashboard/page.tsx
git commit -m "feat(reports): weekly reports page, nav, and dashboard strip (S2 UI)"
```

---

### Task 11: Athlete report card page (S2 UI)

**Files:**
- Create: `app/coach/students/[id]/report/page.tsx`
- Modify: `app/coach/students/[id]/page.tsx` (header action link)

**Interfaces:**
- Consumes: `api.reports.athleteCard` (Task 8).

- [ ] **Step 1: Create the print page**

```tsx
// app/coach/students/[id]/report/page.tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatTimeMs } from "@/lib/format";

export default function AthleteReportPage() {
  const params = useParams<{ id: string }>();
  const card = useQuery(api.reports.athleteCard, {
    studentId: params.id as never,
  });

  if (card === undefined) {
    return <Skeleton className="h-96 rounded-xl" />;
  }
  if (card === null) {
    return (
      <EmptyState
        icon={ArrowLeft}
        title="Student not found"
        description="This student may have been removed."
      />
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/coach/students/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to student
        </Link>
        <Button variant="outline" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Athlete Report — {card.student.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {card.groupName ?? "No group"}
          {card.student.age !== null ? ` · ${card.student.age} yrs` : ""}
          {card.student.joinedAt ? ` · joined ${formatDate(card.student.joinedAt)}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pb-4 pt-4">
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {card.attendance.percentage === null ? "—" : `${card.attendance.percentage}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {card.attendance.attended} of {card.attendance.total} records
            </p>
          </CardContent>
        </Card>
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pb-4 pt-4">
            <p className="text-xs text-muted-foreground">Commitment</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {card.commitment === null || card.commitment.percentage === null
                ? "—"
                : `${card.commitment.percentage}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {card.commitment === null
                ? "Assign a group to track"
                : `${card.commitment.attended} of ${card.commitment.held} practices`}
            </p>
          </CardContent>
        </Card>
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pb-4 pt-4">
            <p className="text-xs text-muted-foreground">Personal bests</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{card.pbs.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Skills</CardTitle>
          </CardHeader>
          <CardContent>
            {card.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill records.</p>
            ) : (
              <ul className="space-y-1.5">
                {card.skills.map((skill) => (
                  <li key={skill.name} className="flex justify-between text-sm">
                    <span>{skill.name}</span>
                    <span className="font-medium tabular-nums">{skill.progress}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Personal bests</CardTitle>
          </CardHeader>
          <CardContent>
            {card.pbs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No times recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {card.pbs.map((pb) => (
                  <li key={pb.label} className="flex justify-between text-sm">
                    <span>{pb.label}</span>
                    <span className="font-medium tabular-nums">
                      {formatTimeMs(pb.bestTimeMs)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({formatDate(pb.bestDate)})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Weekly volume (last 12 weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
            {card.volumeByWeek.map((week) => (
              <li key={week.label} className="flex justify-between">
                <span className="text-muted-foreground">{week.label.slice(5)}</span>
                <span className="tabular-nums">
                  {week.value === null ? "—" : `${week.value.toLocaleString()} m`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Goals</CardTitle>
        </CardHeader>
        <CardContent>
          {card.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals set.</p>
          ) : (
            <ul className="space-y-1.5">
              {card.goals.map((goal) => (
                <li key={goal.title} className="flex justify-between text-sm">
                  <span>
                    {goal.title}
                    {goal.targetDate ? ` (due ${formatDate(goal.targetDate)})` : ""}
                  </span>
                  <span className="tabular-nums">
                    {goal.progress}% · {goal.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Link from the student detail page**

In `app/coach/students/[id]/page.tsx` PageHeader `actions` (after `ExportAttendanceDialog`), add (imports: `Button`, `FileText`; `Link` already imported):

```tsx
            <Link href={`/coach/students/${student.studentId}/report`}>
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Report card
              </Button>
            </Link>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass. Manual: student detail → "Report card" → browser print preview.

```bash
git add "app/coach/students/[id]/report/page.tsx" "app/coach/students/[id]/page.tsx"
git commit -m "feat(reports): printable athlete report card page (S2 UI)"
```

---

### Task 12: Coach overview v2 with bounded KPIs (S3 backend)

**Files:**
- Create: `convex/lib/kpis.ts`
- Modify: `convex/dashboard.ts` (rewrite `coachOverview`; keep `studentNameFor`, `buildRecentActivity`, `studentDashboard` untouched)
- Test: `convex/dashboard-kpis.test.ts`

**Interfaces:**
- Consumes: `todayInCoachTz`, `monthKeysBack`, `weekStartsBack`, `weekStartIso`, `daysBetween` from `./lib/time`.
- Produces: `coachOverview` new shape `{ stats: { totalStudents, activeStudents, pbsThisMonth }, kpis: { attendanceThisMonth, attendanceLastMonth, volumeThisWeek, volumeLastWeek }, goalDeadlines: [{ studentName, title, targetDate }], recentActivity }` (consumed by Task 13). `lib/kpis.ts` exports `pbsInMonth(ctx, studentId, targetMonth): Promise<number>`. The 10,000-row full-table session scan is deleted.

- [ ] **Step 1: Write the failing test**

```ts
// convex/dashboard-kpis.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { datePlusDays, todayInCoachTz } from "./lib/time";

describe("coachOverview v2 KPIs", () => {
  it("computes weekly volume deltas and PBs this month", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Alex Santos");
    const today = todayInCoachTz();

    await t.run(async (ctx) => {
      // This week: 1500m; last week: 1000m (calendar-crossing safe:
      // -7 days is always the previous ISO week only if today is not
      // Monday; to be deterministic use the week-start math itself.)
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: today,
        title: "AM",
        durationMinutes: 60,
        distanceMeters: 1500,
        strokes: [],
        updatedAt: Date.now(),
      });
      const mondayThisWeek = weekStart(today);
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: offset(mondayThisWeek, -3),
        title: "PM",
        durationMinutes: 60,
        distanceMeters: 1000,
        strokes: [],
        updatedAt: Date.now(),
      });
      // A PB this month: improves on a >1-month-old result.
      await ctx.db.insert("timeResults", {
        studentId,
        date: datePlusDays(today, -35),
        distanceMeters: 50,
        stroke: "freestyle",
        course: "short",
        timeMs: 31000,
        context: "practice",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeResults", {
        studentId,
        date: datePlusDays(today, -3),
        distanceMeters: 50,
        stroke: "freestyle",
        course: "short",
        timeMs: 30000,
        context: "time_trial",
        updatedAt: Date.now(),
      });
    });

    const overview = await t
      .withIdentity({ subject: coachId })
      .query(api.dashboard.coachOverview, {});

    expect(overview.stats.pbsThisMonth).toBe(1);
    expect(overview.kpis.volumeThisWeek).toBe(1500);
    expect(overview.kpis.volumeLastWeek).toBe(1000);
    expect(Array.isArray(overview.goalDeadlines)).toBe(true);
  });

  it("rejects non-coach callers", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedStudent(t, "Maria Reyes");
    await expect(
      t.withIdentity({ subject: userId }).query(api.dashboard.coachOverview, {}),
    ).rejects.toThrow("Not authorized");
  });
});

// Local helpers mirroring lib/time so the test file is self-contained.
function offset(date: string, days: number): string {
  return new Date(
    new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
}

function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return offset(date, -((dow + 6) % 7));
}
```

Note: the "-3 days before this Monday" fixture lands in last ISO week unless today is Monday–Wednesday. If run on a Monday the second session also falls in this week; the `volumeLastWeek` assertion then equals `null`. To stay deterministic on any run date, replace the second session's date with `offset(weekStart(today), -3)` as written (always the prior week: Wednesday of last week). The code above already does this — keep it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/dashboard-kpis.test.ts`
Expected: FAIL — current `coachOverview` has no `stats.pbsThisMonth` / `kpis`.

- [ ] **Step 3: Implement `lib/kpis.ts`**

```ts
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
```

- [ ] **Step 4: Rewrite `coachOverview` in `convex/dashboard.ts`**

Add imports (merge with existing):

```ts
import {
  daysBetween,
  monthKeysBack,
  todayInCoachTz,
  weekStartIso,
  weekStartsBack,
} from "./lib/time";
import { pbsInMonth } from "./lib/kpis";
```

Delete the existing `coachOverview` query body (the whole `export const coachOverview = query({...})` block including the 10,000-row `take` at dashboard.ts:64-69) and replace with:

```ts
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run convex/dashboard-kpis.test.ts && npm test`
Expected: all PASS. Note: `app/coach/dashboard/page.tsx` no longer typechecks against the new shape — fixed in Task 13. Run `npx vitest run` (tests do not typecheck the UI) and defer the `npm run typecheck` gate to Task 13.

- [ ] **Step 6: Commit**

```bash
git add convex/dashboard.ts convex/lib/kpis.ts convex/dashboard-kpis.test.ts
git commit -m "feat(dashboard): coachOverview v2 with bounded KPI scans (S3 backend)"
```

---

### Task 13: Coach dashboard v2 restructure (S3 UI)

**Files:**
- Modify: `app/coach/dashboard/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `coachOverview` v2 shape (Task 12), `api.practices.listUpcoming` (existing), `NeedsAttentionCard` (Task 4), `WeeklyReportCard` + `WeeklyPayload` (Task 10).

- [ ] **Step 1: Rewrite the dashboard page**

Replace the entire content of `app/coach/dashboard/page.tsx` with:

```tsx
// app/coach/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Search,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CompletePracticeDialog } from "@/components/coach/complete-practice-dialog";
import { NeedsAttentionCard } from "@/components/coach/needs-attention-card";
import {
  WeeklyReportCard,
  type WeeklyPayload,
} from "@/components/coach/weekly-report-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime, todayDateString } from "@/lib/format";

const activityIcons = {
  attendance: ClipboardCheck,
  session: Dumbbell,
  skill: Activity,
  goal: Target,
} as const;

function DeltaArrow({ delta, suffix = "" }: { delta: number | null; suffix?: string }) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {up ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

export default function CoachDashboardPage() {
  const overview = useQuery(api.dashboard.coachOverview, {});
  const reports = useQuery(api.reports.list, {});
  const [search, setSearch] = useState("");
  const students = useQuery(api.students.list, { search });
  const upcomingPractices = useQuery(api.practices.listUpcoming, {
    fromDate: todayDateString(),
  });

  const activity = useMemo(() => overview?.recentActivity ?? [], [overview]);

  const today = todayDateString();
  const todaysPractices = (upcomingPractices ?? []).filter(
    (p) => p.date === today,
  );
  const nextPractices = (upcomingPractices ?? [])
    .filter((p) => p.date > today)
    .slice(0, 5);

  const attendanceDelta =
    overview?.kpis.attendanceThisMonth !== null &&
    overview?.kpis.attendanceThisMonth !== undefined &&
    overview?.kpis.attendanceLastMonth !== null
      ? overview.kpis.attendanceThisMonth - overview.kpis.attendanceLastMonth
      : null;
  const volumeDelta =
    overview?.kpis.volumeThisWeek !== null &&
    overview?.kpis.volumeThisWeek !== undefined &&
    overview?.kpis.volumeLastWeek !== null
      ? overview.kpis.volumeThisWeek - overview.kpis.volumeLastWeek
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How are your swimmers progressing?"
        actions={
          <Link href="/coach/times">
            <Button variant="outline" className="gap-2">
              <Timer className="h-4 w-4 text-amber-500" />
              Run Time Trial
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
            Today&apos;s Practices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingPractices === undefined ? (
            <Skeleton className="h-14" />
          ) : todaysPractices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No practices scheduled today.{" "}
              <Link
                href="/coach/practices"
                className="underline hover:text-foreground"
              >
                Schedule one
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y">
              {todaysPractices.map((practice) => (
                <li
                  key={practice._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{practice.title}</span>
                      <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-400">
                        {practice.plannedDurationMinutes} min
                        {practice.plannedDistanceMeters !== null
                          ? ` · ${practice.plannedDistanceMeters.toLocaleString()} m`
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {practice.groupName}
                      {practice.startTime ? ` at ${practice.startTime}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CompletePracticeDialog practice={practice} />
                    <Link
                      href="/coach/attendance"
                      className="text-sm underline text-muted-foreground hover:text-foreground"
                    >
                      Roll call
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <NeedsAttentionCard />

          {overview === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={ClipboardCheck}
                label="Attendance"
                value={
                  overview.kpis.attendanceThisMonth === null
                    ? "—"
                    : `${overview.kpis.attendanceThisMonth}%`
                }
                hint="This month, whole team"
              />
              <StatCard
                icon={Waves}
                label="Weekly volume"
                value={
                  overview.kpis.volumeThisWeek === null
                    ? "—"
                    : `${overview.kpis.volumeThisWeek.toLocaleString()} m`
                }
                hint="vs last week"
              />
              <StatCard
                icon={Timer}
                label="PBs this month"
                value={String(overview.stats.pbsThisMonth)}
                hint="New personal bests"
              />
              <StatCard
                icon={Users}
                label="Active swimmers"
                value={String(overview.stats.activeStudents)}
                hint={`${overview.stats.totalStudents} total`}
              />
            </div>
          )}

          {overview !== undefined && (attendanceDelta !== null || volumeDelta !== null) && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {attendanceDelta !== null && (
                <span className="inline-flex items-center gap-1.5">
                  Attendance vs last month <DeltaArrow delta={attendanceDelta} suffix=" pts" />
                </span>
              )}
              {volumeDelta !== null && (
                <span className="inline-flex items-center gap-1.5">
                  Volume vs last week{" "}
                  <DeltaArrow delta={volumeDelta} suffix=" m" />
                </span>
              )}
            </div>
          )}

          {reports !== undefined && reports.reports.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                    Last week
                  </span>
                  <Link
                    href="/coach/reports"
                    className="text-sm underline text-muted-foreground hover:text-foreground"
                  >
                    All reports
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WeeklyReportCard
                  payload={JSON.parse(reports.reports[0]!.payloadJson) as WeeklyPayload}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No activity yet"
                  description="Attendance, sessions, skills and goals will appear here as you record them."
                  className="border-0 py-6"
                />
              ) : (
                <ul className="space-y-3">
                  {activity.map((item, i) => {
                    const Icon = activityIcons[item.kind];
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Icon
                            className="size-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm">
                            <span className="font-medium">{item.studentName}</span>{" "}
                            <span className="text-muted-foreground">{item.detail}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(item.atMs)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4 text-muted-foreground" aria-hidden="true" />
                Goal deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview === undefined ? (
                <Skeleton className="h-16" />
              ) : overview.goalDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming deadlines in the next 14 days.
                </p>
              ) : (
                <ul className="divide-y">
                  {overview.goalDeadlines.map((goal, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{goal.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {goal.studentName}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatDate(goal.targetDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Next practices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingPractices === undefined ? (
                <Skeleton className="h-16" />
              ) : nextPractices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled after today.{" "}
                  <Link
                    href="/coach/practices"
                    className="underline hover:text-foreground"
                  >
                    Plan one
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y">
                  {nextPractices.map((practice) => (
                    <li
                      key={practice._id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {practice.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {practice.groupName}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatDate(practice.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <CardTitle className="text-base">Students</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search students…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </div>
        </CardHeader>
        <CardContent>
          {students === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search !== "" ? "No matching students" : "No students yet"}
              description={
                search !== ""
                  ? "Try a different name or email."
                  : "Create your first student to start tracking progress."
              }
              className="border-0 py-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden sm:table-cell">Attendance</TableHead>
                    <TableHead className="hidden md:table-cell">Progress</TableHead>
                    <TableHead className="hidden lg:table-cell">Current goal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell>
                        <Link
                          href={`/coach/students/${student.studentId}`}
                          className="flex items-center gap-2 font-medium hover:underline"
                        >
                          <StudentAvatar
                            name={student.name}
                            image={student.image}
                            className="size-7"
                          />
                          <span className="max-w-32 truncate sm:max-w-none">
                            {student.name}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {student.attendancePercentage === null ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <span className="text-sm font-medium tabular-nums">
                            {student.attendancePercentage}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {student.overallProgress === null ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <span className="text-sm font-medium tabular-nums">
                            {student.overallProgress}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="block max-w-48 truncate text-sm text-muted-foreground">
                          {student.currentGoalTitle ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={student.status === "active" ? "default" : "secondary"}
                        >
                          {student.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: add `import { Button } from "@/components/ui/button";` to the imports (used by the "Run Time Trial" action).

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass — this task restores the typecheck gate broken by Task 12.

```bash
git add app/coach/dashboard/page.tsx
git commit -m "feat(coach): dashboard v2 layout with KPIs, flags, and side rail (S3 UI)"
```

---

### Task 14: Seed intelligence fixtures + final verification

**Files:**
- Modify: `convex/seed.ts` (extend demo data)
- Modify: `README.md` (architecture section)

**Interfaces:**
- Consumes: schema tables; existing seed entry point.
- Produces: demo data that triggers at least one flag of each kind and 12 weeks of volume history.

- [ ] **Step 1: Add intelligence fixtures to the seed**

In `convex/seed.ts`, add this function near the other seed helpers (it uses only `ctx.db.insert`, matching existing patterns):

```ts
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";

/**
 * Demo data for the intelligence features: one swimmer with an
 * absence streak, one stale-PB event, one near-due goal, and 12
 * weeks of volume history.
 */
export async function seedIntelligenceFixtures(ctx: any): Promise<void> {
  const today = todayInCoachTz();
  const students = await ctx.db.query("students").take(500);
  if (students.length === 0) return;
  const streaker = students[0]!;
  const idle = students[1] ?? students[0]!;

  // Absence streak on the first demo swimmer (latest two days absent).
  for (const offset of [1, 2]) {
    await ctx.db.insert("attendance", {
      studentId: streaker._id,
      date: datePlusDays(today, -offset),
      status: "absent",
      updatedAt: Date.now(),
    });
  }

  // 12 weeks of weekly volume for the first swimmer.
  for (let week = 11; week >= 0; week--) {
    const monday = weekStartIso(datePlusDays(today, -7 * week));
    await ctx.db.insert("trainingSessions", {
      studentId: streaker._id,
      date: datePlusDays(monday, 2),
      title: `Demo volume week ${12 - week}`,
      durationMinutes: 75,
      distanceMeters: 2500 + week * 100,
      strokes: ["freestyle"],
      updatedAt: Date.now(),
    });
  }

  // Stale PB (9 weeks old) with 3 results -> plateau flag.
  const lastWeekMonday = weekStartIso(datePlusDays(today, -7));
  const staleDates = [
    datePlusDays(lastWeekMonday, -7 * 8),
    datePlusDays(lastWeekMonday, -7 * 5),
    datePlusDays(lastWeekMonday, -1),
  ];
  for (const [i, date] of staleDates.entries()) {
    await ctx.db.insert("timeResults", {
      studentId: streaker._id,
      date,
      distanceMeters: 100,
      stroke: "backstroke",
      course: "short",
      timeMs: 78000 - i * 500,
      context: "time_trial",
      updatedAt: Date.now(),
    });
  }

  // Goal due in 7 days -> goal_deadline flag.
  await ctx.db.insert("trainingGoals", {
    studentId: streaker._id,
    title: "Demo: qualify for regionals",
    type: "manual",
    progress: 60,
    status: "in_progress",
    targetDate: datePlusDays(today, 7),
    updatedAt: Date.now(),
  });

  // Idle swimmer: joined 40 days ago, no sessions -> inactive flag.
  await ctx.db.patch(idle._id, { joinedAt: datePlusDays(today, -40) });
}
```

Adjust the `ctx: any` parameter to the seed file's existing context type if one is in scope (match neighboring helper signatures). Call `await seedIntelligenceFixtures(ctx)` from the main seed function alongside the existing demo-data calls.

- [ ] **Step 2: Verify seeds and run all gates**

Run: `npm test`
Expected: all tests PASS (including `seed.test.ts` — if it asserts exact table counts, update those expectations for the added rows: +2 attendance, +12 sessions, +3 timeResults, +1 goal).

Run: `npx convex run seed:resetDemo` then `npx convex run seed:seed` (dev deployment), then `npx convex run seed:status` — counts reflect the new fixtures.

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Update the README architecture section**

In `README.md`, extend the `convex/` module list (after the `times.ts` / `dataOverview.ts` lines):

```
  insights.ts      attention flags + trends aggregates (coach & student)
  reports.ts       athlete report card + weekly report list
  crons.ts         weekly report cron (Monday 06:00 Asia/Manila)
  lib/time.ts      coach-timezone date helpers
  lib/flags.ts     attention-flag rule evaluators
  lib/kpis.ts      bounded KPI helpers (PBs this month)
```

And extend the `app/coach/` list with `reports/` and the student `[id]/report` page mention.

- [ ] **Step 4: Final commit**

```bash
git add convex/seed.ts README.md
git commit -m "feat(seed): intelligence demo fixtures and README update (R1 complete)"
```

---

## Verification Checklist (whole plan)

- [ ] `npm test` green, including new files: `time.test.ts`, `flags.test.ts`, `insights-flags.test.ts`, `insights-trends.test.ts`, `reports-card.test.ts`, `reports-weekly.test.ts`, `dashboard-kpis.test.ts`
- [ ] `npm run typecheck` and `npm run lint` green
- [ ] Coach dashboard shows: Today's Practices, Needs Attention, KPI row with delta arrows, Last week strip, goal deadlines + next practices rail, activity, students table
- [ ] Student detail has a Trends tab with 4 charts
- [ ] `/coach/reports` renders and prints; athlete report card prints
- [ ] `npx convex dev` shows the cron registered as `weekly-report`
- [ ] Seeded demo data triggers at least `consecutive_misses`, `plateau`, `goal_deadline`, and `inactive` flags

## Self-Review Notes

- Spec coverage: M8 (Tasks 2–4), S1 (Tasks 5–7), S2 (Tasks 8–11), S3 (Tasks 12–13), timezone foundation (Task 1), seed coverage (Task 14). Performance contract enforced in Tasks 3, 5, 9, 12 (bounded/indexed reads; the 10,000-row scan is deleted in Task 12).
- Known deliberate deviations: none. Task 12's attendance fixtures are month-boundary sensitive; its assertions therefore pin volume + PBs (deterministic) per the note in the task.

