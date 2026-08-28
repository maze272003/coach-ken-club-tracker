# Performance Engine (Times, Personal Bests & Measurable Goals v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete swim performance engine in CoachKen Tracker for recording swim times (single & group time trials), automatically tracking Personal Bests (PBs) with time drop calculations, and auto-deriving progress on measurable time and attendance goals.

**Architecture:** Append-only `timeResults` table with composite indexes; dynamic PB derivation; reactive mathematical goal progress derivation on query read; atomic multi-swimmer time trial bulk writes; local session draft recovery; and rich coach & student PB showcases.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Convex (live queries, mutations, indexes, Convex Auth), Vitest + convex-test.

**Spec:** [`docs/superpowers/specs/2026-08-28-performance-engine-times-pbs-goals-design.md`](file:///c:/Users/USER/Documents/data/convex/coachken-tracker/docs/superpowers/specs/2026-08-28-performance-engine-times-pbs-goals-design.md)

## Global Constraints

- **Time format:** Milliseconds stored as integer (`timeMs`). Inputs accept `ss.cs` (e.g. `28.45`) and `m:ss.cs` (e.g. `1:04.25`). Maximum time: $3,600,000\text{ ms}$ ($60\text{ minutes}$).
- **Courses:** `"short"` (25m SCM) and `"long"` (50m LCM) are strictly isolated event records.
- **Distances:** Validated enum `[25, 50, 100, 200, 400, 800, 1500]`.
- **Strokes:** Validated against catalog (`"freestyle"`, `"backstroke"`, `"breaststroke"`, `"butterfly"`, `"im"`).
- **PB Rule:** Strict inequality ($T_{\text{new}} < T_{\text{best}}$). Matching PB does not count as a new PB drop.
- **Goal Baselines:** Frozen at creation in `baselineBestMs`.
- **Dates:** Stored as `YYYY-MM-DD` strings representing local training calendar dates.
- **Access:** Coach-only writes; students query only own records via `resolveStudentAccess` or `requireStudent`.

---

### Task 1: Schema Updates & Stroke Catalog Extension

**Files:**
- Modify: `convex/schema.ts:1-121`
- Modify: `convex/seed.ts` (add `"im"` skill to catalog if missing)

**Interfaces:**
- Produces: `timeResults` table with `by_student_and_event`, `by_student_and_date`, `by_date`, `by_event` indexes; updated `trainingGoals` table.

- [ ] **Step 1: Write failing schema / typecheck test**

Create `convex/times-schema.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";

describe("Performance Engine Schema", () => {
  it("defines timeResults and extended trainingGoals tables", () => {
    const t = convexTest(schema);
    expect(schema.tables.timeResults).toBeDefined();
    expect(schema.tables.trainingGoals).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/times-schema.test.ts`  
Expected: FAIL (table `timeResults` not defined on schema)

- [ ] **Step 3: Update `convex/schema.ts`**

Add `timeResults` table and extend `trainingGoals` in `convex/schema.ts`:
```typescript
  timeResults: defineTable({
    studentId: v.id("students"),
    date: v.string(),
    distanceMeters: v.number(),
    stroke: v.string(),
    course: v.union(v.literal("short"), v.literal("long")),
    timeMs: v.number(),
    context: v.union(
      v.literal("practice"),
      v.literal("time_trial"),
      v.literal("meet")
    ),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_student_and_event", ["studentId", "stroke", "distanceMeters", "course"])
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_date", ["date"])
    .index("by_event", ["stroke", "distanceMeters", "course"]),
  trainingGoals: defineTable({
    studentId: v.id("students"),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.optional(
      v.union(v.literal("manual"), v.literal("time"), v.literal("attendance"))
    ),
    distanceMeters: v.optional(v.number()),
    stroke: v.optional(v.string()),
    course: v.optional(v.union(v.literal("short"), v.literal("long"))),
    targetTimeMs: v.optional(v.number()),
    baselineBestMs: v.optional(v.number()),
    targetAttendancePct: v.optional(v.number()),
    target: v.optional(v.string()),
    progress: v.number(),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("archived")
    ),
    targetDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_student_and_updated", ["studentId", "updatedAt"]),
```

- [ ] **Step 4: Run test and typecheck to verify it passes**

Run: `npx vitest run convex/times-schema.test.ts && npm run typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/times-schema.test.ts
git commit -m "feat(schema): add timeResults table and extend trainingGoals for measurable performance tracking"
```

---

### Task 2: Time Parsing, Formatting & Validation Helpers

**Files:**
- Modify: `lib/format.ts`
- Modify: `convex/lib/validation.ts`
- Test: `convex/times-format.test.ts`

**Interfaces:**
- Produces: `parseTimeToMs(input: string): number | null`, `formatTimeMs(ms: number): string`, `assertTimeMs`, `assertEventDistance`, `assertCourse`, `assertStroke`.

- [ ] **Step 1: Write failing unit tests for format & validation helpers**

Create `convex/times-format.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { formatTimeMs, parseTimeToMs } from "../lib/format";
import { assertCourse, assertEventDistance, assertTimeMs } from "./lib/validation";

describe("Time Parsing and Formatting Helpers", () => {
  it("parses seconds and hundredths correctly", () => {
    expect(parseTimeToMs("28.45")).toBe(28450);
    expect(parseTimeToMs("0.50")).toBe(500);
    expect(parseTimeToMs("59.99")).toBe(59990);
  });

  it("parses minutes, seconds, and hundredths correctly", () => {
    expect(parseTimeToMs("1:04.25")).toBe(64250);
    expect(parseTimeToMs("01:04.25")).toBe(64250);
    expect(parseTimeToMs("15:30.00")).toBe(930000);
  });

  it("rejects invalid time strings or out-of-bounds numbers", () => {
    expect(parseTimeToMs("")).toBeNull();
    expect(parseTimeToMs("abc")).toBeNull();
    expect(parseTimeToMs("0")).toBeNull();
    expect(parseTimeToMs("0.00")).toBeNull();
    expect(parseTimeToMs("-5.00")).toBeNull();
    expect(parseTimeToMs("65:00.00")).toBeNull(); // > 60 minutes
  });

  it("formats milliseconds into standard swim display", () => {
    expect(formatTimeMs(28450)).toBe("28.45");
    expect(formatTimeMs(64250)).toBe("1:04.25");
    expect(formatTimeMs(930000)).toBe("15:30.00");
  });

  it("validates event distances and courses", () => {
    expect(() => assertEventDistance(50)).not.toThrow();
    expect(() => assertEventDistance(75)).toThrow();
    expect(() => assertCourse("short")).not.toThrow();
    expect(() => assertCourse("yards" as any)).toThrow();
    expect(() => assertTimeMs(25000)).not.toThrow();
    expect(() => assertTimeMs(0)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/times-format.test.ts`  
Expected: FAIL (functions not exported/implemented)

- [ ] **Step 3: Implement helpers in `lib/format.ts` and `convex/lib/validation.ts`**

In `lib/format.ts`:
```typescript
/**
 * Formats integer milliseconds into swim time string: "28.45" or "1:04.25".
 */
export function formatTimeMs(ms: number): string {
  if (ms <= 0) return "--:--.--";
  const totalHundredths = Math.round(ms / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(totalHundredths / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  const csStr = String(hundredths).padStart(2, "0");
  if (minutes === 0) {
    return `${seconds}.${csStr}`;
  }
  const sStr = String(seconds).padStart(2, "0");
  return `${minutes}:${sStr}.${csStr}`;
}

/**
 * Parses user-entered swim time ("28.45", "1:04.25", "01:04.25") into integer milliseconds.
 * Returns null if input is malformed or out of bounds (1ms - 3,600,000ms).
 */
export function parseTimeToMs(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pattern 1: mm:ss.cs or m:ss.cs (e.g. 1:04.25)
  const minSecMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (minSecMatch) {
    const mins = parseInt(minSecMatch[1], 10);
    const secs = parseInt(minSecMatch[2], 10);
    const csRaw = minSecMatch[3] ?? "0";
    const cs = parseInt(csRaw.padEnd(2, "0").slice(0, 2), 10);

    if (secs >= 60 || mins > 60) return null;
    const totalMs = mins * 60000 + secs * 1000 + cs * 10;
    if (totalMs <= 0 || totalMs > 3600000) return null;
    return totalMs;
  }

  // Pattern 2: ss.cs or s.cs or ss (e.g. 28.45, 59.9)
  const secMatch = trimmed.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (secMatch) {
    const secs = parseInt(secMatch[1], 10);
    const csRaw = secMatch[2] ?? "0";
    const cs = parseInt(csRaw.padEnd(2, "0").slice(0, 2), 10);

    const totalMs = secs * 1000 + cs * 10;
    if (totalMs <= 0 || totalMs > 3600000) return null;
    return totalMs;
  }

  return null;
}
```

In `convex/lib/validation.ts`:
```typescript
export const VALID_DISTANCES = [25, 50, 100, 200, 400, 800, 1500] as const;
export type EventDistance = (typeof VALID_DISTANCES)[number];

export const VALID_STROKES = [
  "freestyle",
  "backstroke",
  "breaststroke",
  "butterfly",
  "im",
] as const;
export type ValidStroke = (typeof VALID_STROKES)[number];

export function assertTimeMs(ms: number): void {
  if (!Number.isInteger(ms) || ms <= 0 || ms > 3600000) {
    throw new ConvexError("Time must be between 0.01s and 60 minutes");
  }
}

export function assertEventDistance(distance: number): void {
  if (!VALID_DISTANCES.includes(distance as any)) {
    throw new ConvexError(
      `Invalid distance. Must be one of: ${VALID_DISTANCES.join(", ")}m`
    );
  }
}

export function assertCourse(course: string): asserts course is "short" | "long" {
  if (course !== "short" && course !== "long") {
    throw new ConvexError("Course must be 'short' (25m) or 'long' (50m)");
  }
}

export function assertStroke(stroke: string): asserts stroke is ValidStroke {
  if (!VALID_STROKES.includes(stroke as any)) {
    throw new ConvexError(`Invalid stroke: ${stroke}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/times-format.test.ts`  
Expected: PASS (all 5 test suites pass)

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts convex/lib/validation.ts convex/times-format.test.ts
git commit -m "feat(times): add time parsing, formatting, and event validation helpers"
```

---

### Task 3: Single Time Result Mutation, PB Detection & Deletion (`convex/times.ts`)

**Files:**
- Create: `convex/times.ts`
- Test: `convex/times-crud.test.ts`
- Test: `convex/times-pb.test.ts`

**Interfaces:**
- Produces: `times.create`, `times.remove`, `times.listForStudent`, `times.getPersonalBests`, `times.myPersonalBests`, `times.listRecent`.

- [ ] **Step 1: Write failing tests for single time creation and PB calculation**

Create `convex/times-crud.test.ts` and `convex/times-pb.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

describe("Time Results CRUD & PB Engine", () => {
  it("records a time result and detects new personal bests with deltas", async () => {
    const t = convexTest(schema);
    const coachUser = await t.mutation(api.seed.testSetupCoach, {});
    const student = await t.mutation(api.seed.testCreateStudent, { name: "Swimmer One" });

    // 1. First swim: 30.00s (30000ms) -> First PB
    const res1 = await t.as(coachUser).mutation(api.times.create, {
      studentId: student.studentId,
      date: "2026-08-01",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 30000,
      context: "practice",
    });
    expect(res1.isNewPersonalBest).toBe(true);
    expect(res1.previousBestMs).toBeNull();
    expect(res1.deltaMs).toBeNull();

    // 2. Slower swim: 31.00s -> Not a PB
    const res2 = await t.as(coachUser).mutation(api.times.create, {
      studentId: student.studentId,
      date: "2026-08-05",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 31000,
      context: "practice",
    });
    expect(res2.isNewPersonalBest).toBe(false);

    // 3. Faster swim: 28.50s (28500ms) -> New PB (-1.50s / -5.0%)
    const res3 = await t.as(coachUser).mutation(api.times.create, {
      studentId: student.studentId,
      date: "2026-08-10",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 28500,
      context: "meet",
    });
    expect(res3.isNewPersonalBest).toBe(true);
    expect(res3.previousBestMs).toBe(30000);
    expect(res3.deltaMs).toBe(1500);
    expect(res3.deltaPct).toBe(5);

    // 4. Equal time: 28.50s -> Tie (Not a new PB)
    const res4 = await t.as(coachUser).mutation(api.times.create, {
      studentId: student.studentId,
      date: "2026-08-15",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 28500,
      context: "practice",
    });
    expect(res4.isNewPersonalBest).toBe(false);

    // 5. Query PBs
    const pbs = await t.as(coachUser).query(api.times.getPersonalBests, {
      studentId: student.studentId,
    });
    expect(pbs).toHaveLength(1);
    expect(pbs[0].timeMs).toBe(28500);
    expect(pbs[0].event).toBe("50m Freestyle (SCM)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/times-crud.test.ts`  
Expected: FAIL (`api.times` not found)

- [ ] **Step 3: Implement `convex/times.ts`**

Create `convex/times.ts` containing:
- `create` mutation (with coach auth, validations, PB calculation against existing `by_student_and_event`, auto-goal complete invocation).
- `remove` mutation (coach-only).
- `listForStudent` query (with `resolveStudentAccess`, sorting, PB tag on each record).
- `getPersonalBests` query (groups by event, finds minimum `timeMs`).
- `myPersonalBests` query (student session auth).
- `listRecent` query (coach dashboard / squad feed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/times-crud.test.ts convex/times-pb.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/times.ts convex/times-crud.test.ts convex/times-pb.test.ts
git commit -m "feat(times): implement time result CRUD, PB detection, and personal best queries"
```

---

### Task 4: Bulk Time Trial Mutation (`convex/times.ts`)

**Files:**
- Modify: `convex/times.ts`
- Test: `convex/times-bulk.test.ts`

**Interfaces:**
- Produces: `times.recordBulk` mutation.

- [ ] **Step 1: Write failing test for bulk time trial recording**

Create `convex/times-bulk.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

describe("Bulk Time Trial Recording", () => {
  it("records time trial entries atomically and returns PB summaries", async () => {
    const t = convexTest(schema);
    const coachUser = await t.mutation(api.seed.testSetupCoach, {});
    const group = await t.as(coachUser).mutation(api.groups.create, { name: "Sprint Squad" });
    const s1 = await t.mutation(api.seed.testCreateStudent, { name: "Alice", groupId: group.groupId });
    const s2 = await t.mutation(api.seed.testCreateStudent, { name: "Bob", groupId: group.groupId });

    const result = await t.as(coachUser).mutation(api.times.recordBulk, {
      groupId: group.groupId,
      date: "2026-08-20",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      context: "time_trial",
      entries: [
        { studentId: s1.studentId, timeMs: 29500 },
        { studentId: s2.studentId, timeMs: 31200 },
      ],
    });

    expect(result.recordedCount).toBe(2);
    expect(result.newPersonalBests).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/times-bulk.test.ts`  
Expected: FAIL (`recordBulk` not exported)

- [ ] **Step 3: Implement `times.recordBulk` in `convex/times.ts`**

Add `recordBulk` mutation:
- Validates group, date, event, course.
- Validates all entries (rejects duplicates or invalid times atomically).
- In a single loop, evaluates PBs, inserts `timeResults`, checks goals.
- Returns `{ recordedCount, newPersonalBests: [{ studentId, studentName, timeMs, deltaMs, deltaPct }] }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/times-bulk.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/times.ts convex/times-bulk.test.ts
git commit -m "feat(times): implement atomic bulk time trial recording mutation"
```

---

### Task 5: Measurable Goals v2 & Auto-Completion Trigger (`convex/goals.ts`)

**Files:**
- Modify: `convex/goals.ts`
- Modify: `convex/lib/stats.ts`
- Test: `convex/goals-measurable.test.ts`

**Interfaces:**
- Produces: Updated `goals.create`, `goals.update`, `goals.remove`, `goals.listForStudent`, `goals.my`, `goals.backfillGoalTypes`, `checkAndAutoCompleteGoals` helper.

- [ ] **Step 1: Write failing test for measurable time and attendance goals**

Create `convex/goals-measurable.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

describe("Measurable Goals v2 (Time & Attendance)", () => {
  it("dynamically derives time goal progress and auto-completes when target is reached", async () => {
    const t = convexTest(schema);
    const coach = await t.mutation(api.seed.testSetupCoach, {});
    const s = await t.mutation(api.seed.testCreateStudent, { name: "Clara" });

    // Initial PB: 32.00s (32000ms)
    await t.as(coach).mutation(api.times.create, {
      studentId: s.studentId,
      date: "2026-08-01",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 32000,
      context: "practice",
    });

    // Create Time Goal: Break 30.00s (30000ms), baseline captured as 32000ms
    const { goalId } = await t.as(coach).mutation(api.goals.create, {
      studentId: s.studentId,
      title: "Sub-30 50m Free",
      type: "time",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      targetTimeMs: 30000,
      progress: 0,
      status: "in_progress",
    });

    // Mid-way swim: 31.00s -> Progress: (32 - 31)/(32 - 30) = 50%
    await t.as(coach).mutation(api.times.create, {
      studentId: s.studentId,
      date: "2026-08-10",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 31000,
      context: "practice",
    });

    let goals = await t.as(coach).query(api.goals.listForStudent, { studentId: s.studentId });
    expect(goals[0].derivedProgress).toBe(50);
    expect(goals[0].status).toBe("in_progress");

    // Winning swim: 29.80s -> Goal auto-completes to 100%!
    await t.as(coach).mutation(api.times.create, {
      studentId: s.studentId,
      date: "2026-08-20",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 29800,
      context: "meet",
    });

    goals = await t.as(coach).query(api.goals.listForStudent, { studentId: s.studentId });
    expect(goals[0].derivedProgress).toBe(100);
    expect(goals[0].status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/goals-measurable.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Goals v2 logic in `convex/goals.ts` and `convex/lib/stats.ts`**

- Extend `create` to auto-capture current PB as `baselineBestMs` if omitted.
- Implement `deriveGoalProgress(ctx, goal)` helper in `convex/lib/stats.ts`.
- Enrich `listForStudent` and `my` queries with `derivedProgress`, `currentBestMs`, `currentAttendancePct`.
- Implement `checkAndAutoCompleteGoals(ctx, studentId)` and call it from `times.create`, `times.recordBulk`, `attendance.record`, `attendance.recordBulk`.
- Add `goals.remove` mutation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/goals-measurable.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/goals.ts convex/lib/stats.ts convex/goals-measurable.test.ts
git commit -m "feat(goals): implement Measurable Goals v2 with dynamic progress derivation and auto-completion"
```

---

### Task 6: Time Results CSV Export Query (`convex/times.ts`)

**Files:**
- Modify: `convex/times.ts`
- Test: `convex/times-export.test.ts`

**Interfaces:**
- Produces: `times.exportTimes` query.

- [ ] **Step 1: Write failing test for CSV export query**

Create `convex/times-export.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

describe("Time Results Export", () => {
  it("returns enriched records with formatted times and student names for export", async () => {
    const t = convexTest(schema);
    const coach = await t.mutation(api.seed.testSetupCoach, {});
    const s = await t.mutation(api.seed.testCreateStudent, { name: "David" });

    await t.as(coach).mutation(api.times.create, {
      studentId: s.studentId,
      date: "2026-08-15",
      stroke: "butterfly",
      distanceMeters: 100,
      course: "long",
      timeMs: 62500,
      context: "meet",
    });

    const exportData = await t.as(coach).query(api.times.exportTimes, {
      stroke: "butterfly",
    });

    expect(exportData.records).toHaveLength(1);
    expect(exportData.records[0].studentName).toBe("David");
    expect(exportData.records[0].formattedTime).toBe("1:02.50");
    expect(exportData.records[0].course).toBe("long");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/times-export.test.ts`  
Expected: FAIL (`exportTimes` not implemented)

- [ ] **Step 3: Implement `times.exportTimes` in `convex/times.ts`**

Add `exportTimes` query filtering by student, group, date range, stroke, distance, course, and context, enriching with student name, group name, formatted time string, and PB flag.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/times-export.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/times.ts convex/times-export.test.ts
git commit -m "feat(times): implement exportTimes query for CSV and reporting"
```

---

### Task 7: Coach Time Trial Hub UI & Time Log Page (`app/coach/times/page.tsx`)

**Files:**
- Create: `app/coach/times/page.tsx`
- Modify: `app/coach/layout.tsx` (add "Times" nav item)
- Modify: `app/coach/dashboard/page.tsx` (add "Run Time Trial" quick action button)

**Interfaces:**
- Produces: Coach `/coach/times` hub with Time Trial Sheet (Tab 1) and Squad Time Log + CSV Export (Tab 2).

- [ ] **Step 1: Create `app/coach/times/page.tsx`**

Build the full page with:
1. **Time Trial Sheet:**
   - Group, Stroke, Distance, Course, Date, Context selectors.
   - Active members grid with input fields, formatted placeholders, autofocus navigation.
   - `sessionStorage` autosave draft cache with "Draft Restored" notice.
   - "Save Time Trial" action triggering `times.recordBulk` with celebratory PB achievement summary dialog.
2. **Squad Time Log:**
   - Filter bar (Group, Stroke, Distance, Course).
   - Table of recorded times with badge tags (`PB`, `Meet`, `Time Trial`), formatted times (`28.45`, `1:04.25`), delete button.
   - "Export CSV" button generating `coachken-swim-times-YYYY-MM-DD.csv`.

- [ ] **Step 2: Update `app/coach/layout.tsx` and `app/coach/dashboard/page.tsx`**

Add "Times" nav item (`Timer` icon from lucide-react) to sidebar, and add "Run Time Trial" button in dashboard quick actions.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/coach/times/page.tsx app/coach/layout.tsx app/coach/dashboard/page.tsx
git commit -m "feat(ui): add coach times hub with bulk time trial sheet, squad log, and CSV export"
```

---

### Task 8: Swimmer Profile "Times & PBs" Tab & Single Time Logging Modal

**Files:**
- Modify: `app/coach/students/[id]/page.tsx` (or student detail view components)
- Create: `components/coach/log-time-dialog.tsx`

**Interfaces:**
- Produces: "Times & PBs" tab in student profile with Trophy Shelf grid, Event History timeline, and "Log Time" dialog.

- [ ] **Step 1: Create `components/coach/log-time-dialog.tsx`**

Reusable modal dialog with single-swimmer time logging: Date, Event, Course, Context, Time input with live format preview (`1:04.25`), Notes.

- [ ] **Step 2: Add "Times & PBs" Tab to Student Profile**

- Personal Best Trophy Shelf grouped by stroke with SCM / LCM toggle.
- Event History accordion with date, context badge, time drop delta, delete button.
- "Log Time" trigger button.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/coach/log-time-dialog.tsx app/coach/students/
git commit -m "feat(ui): add Times and PBs tab to student profile with single time entry dialog"
```

---

### Task 9: Measurable Goals UI (`app/coach/goals/page.tsx`)

**Files:**
- Modify: `app/coach/goals/page.tsx`
- Create: `components/coach/new-goal-dialog.tsx`

**Interfaces:**
- Produces: Upgraded goal creator supporting Time Target, Attendance % Target, and Custom Progress goals.

- [ ] **Step 1: Create `components/coach/new-goal-dialog.tsx`**

Segmented dialog with:
1. **Time Goal:** Event selector (Stroke + Distance), Course (SCM/LCM), Target Time input, auto-filled Baseline PB.
2. **Attendance Goal:** Target attendance % (e.g. 90%).
3. **Custom Goal:** Free-text target with initial progress slider.
- Target date picker and description.

- [ ] **Step 2: Update Goal Cards in `app/coach/goals/page.tsx`**

Display derived progress bars with badges indicating `"Computed from PB"` or `"Computed from Attendance"`, showing current time vs target time (e.g., `Current: 28.50s → Target: 27.50s (50%)`).

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/coach/new-goal-dialog.tsx app/coach/goals/page.tsx
git commit -m "feat(ui): add Measurable Goals v2 creation dialog and dynamic progress cards"
```

---

### Task 10: Student Portal Experience (`app/student/times`, `app/student/dashboard`, `app/student/goals`)

**Files:**
- Create: `app/student/times/page.tsx`
- Modify: `app/student/layout.tsx` (add "My Times" nav link)
- Modify: `app/student/dashboard/page.tsx` (add Latest PB highlight banner)
- Modify: `app/student/goals/page.tsx` (display dynamic progress)

**Interfaces:**
- Produces: Student-facing Personal Best showcase, progression timeline, and live goal tracking.

- [ ] **Step 1: Create `app/student/times/page.tsx`**

Display:
- PB Trophy Shelf with SCM/LCM toggle.
- Personal progression history with date and improvements.

- [ ] **Step 2: Update Student Dashboard and Goals Pages**

- Highlight card for latest Personal Best on student dashboard.
- Live progress bars on student goals page with clear target countdowns.
- Add "My Times" to student sidebar navigation.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/student/times/page.tsx app/student/layout.tsx app/student/dashboard/page.tsx app/student/goals/page.tsx
git commit -m "feat(student): add My Times PB showcase, latest PB dashboard banner, and live goal tracking"
```

---

### Task 11: Demo Data Seeding & Full Verification

**Files:**
- Modify: `convex/seed.ts`

**Interfaces:**
- Produces: Populated demo database with sample times, PBs, and measurable goals for Alex, Maria, and Daniel across SCM & LCM.

- [ ] **Step 1: Update `convex/seed.ts` with demo times and goals**

Add sample time results across Freestyle, Backstroke, Butterfly, IM, and attach time/attendance goals to demo swimmers.

- [ ] **Step 2: Run complete test suite and typechecks**

Run: `npm test && npm run typecheck && npm run lint`  
Expected: All test suites PASS (including all 35+ tests) with zero errors.

- [ ] **Step 3: Commit**

```bash
git add convex/seed.ts
git commit -m "feat(seed): seed realistic swim times, PBs, and measurable goals for demo data"
```
