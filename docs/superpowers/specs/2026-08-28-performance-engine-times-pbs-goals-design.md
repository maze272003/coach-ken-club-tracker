# CoachKen Tracker — Performance Engine (Times, Personal Bests & Measurable Goals v2) Design

Date: 2026-08-28  
Revision: 2 (Incorporating All Gap Analysis Technical Solutions)  
Status: Approved  
Owner: CoachKen Tracker  
Phase: Phase 2 (Performance)

---

## 1. Purpose

Turn CoachKen Tracker into a competitive swim performance system. Swimming is fundamentally measured in hundredths of a second. This design introduces:
1. **Append-Only Time Tracking:** Record swim times across official distances, courses (SCM/LCM), and contexts (practice, time trial, meet).
2. **Instant Multi-Swimmer Time Trial Sheet:** Enter times for an entire group in a single fast tabular interface with local session draft recovery.
3. **Automated Personal Best (PB) Engine:** Dynamically derive personal bests per event, detect improvements on write, and calculate exact time drops (`-1.45s / -2.1%`).
4. **Measurable Goals v2:** Auto-calculate goal progress directly from time results and attendance records, automatically marking goals completed when targets are met.
5. **Student PB Trophy Showcase:** Swimmers see their official personal records, progression history, and goal countdowns.

---

## 2. Architecture & Data Models

### 2.1 Database Schema (`convex/schema.ts`)

#### 1. `timeResults` Table
Append-only log of every recorded swim time:
```typescript
timeResults: defineTable({
  studentId: v.id("students"),
  date: v.string(), // YYYY-MM-DD (local training calendar date)
  distanceMeters: v.number(), // 25, 50, 100, 200, 400, 800, 1500
  stroke: v.string(), // "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "im"
  course: v.union(v.literal("short"), v.literal("long")), // "short" (25m SCM) | "long" (50m LCM)
  timeMs: v.number(), // Integer milliseconds (e.g. 28450 for 28.45s, 64250 for 1:04.25)
  context: v.union(
    v.literal("practice"),
    v.literal("time_trial"),
    v.literal("meet")
  ),
  notes: v.optional(v.string()), // Max 500 chars
  updatedAt: v.number(), // Unix epoch ms
})
  .index("by_student_and_event", ["studentId", "stroke", "distanceMeters", "course"])
  .index("by_student_and_date", ["studentId", "date"])
  .index("by_date", ["date"])
  .index("by_event", ["stroke", "distanceMeters", "course"]),
```

#### 2. Extended `trainingGoals` Table
Extend existing `trainingGoals` to support computed goals without breaking existing records:
```typescript
trainingGoals: defineTable({
  studentId: v.id("students"),
  title: v.string(),
  description: v.optional(v.string()),
  type: v.optional(
    v.union(v.literal("manual"), v.literal("time"), v.literal("attendance"))
  ), // Defaults to "manual" for legacy records
  
  // Fields for type === "time"
  distanceMeters: v.optional(v.number()),
  stroke: v.optional(v.string()),
  course: v.optional(v.union(v.literal("short"), v.literal("long"))),
  targetTimeMs: v.optional(v.number()),
  baselineBestMs: v.optional(v.number()), // Frozen at goal creation time
  
  // Fields for type === "attendance"
  targetAttendancePct: v.optional(v.number()), // 1 - 100
  
  // Legacy / manual fields
  target: v.optional(v.string()),
  progress: v.number(), // 0 - 100 (for manual goals or fallback)
  status: v.union(
    v.literal("not_started"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("archived")
  ),
  targetDate: v.optional(v.string()), // YYYY-MM-DD
  updatedAt: v.number(),
}).index("by_student_and_updated", ["studentId", "updatedAt"]),
```

#### 3. Skills Catalog Update
Ensure `"im"` (Individual Medley) is registered in the `skills` catalog and stroke validator constants alongside `freestyle`, `backstroke`, `breaststroke`, and `butterfly`.

---

## 3. Core Logic, Rules & Gap Solutions

### 3.1 Bulk Entry Validation & Atomic Execution (Gap 1)
- **Client-Side Pre-Validation:** In the UI time trial sheet, each row validates time syntax as typed (`ss.cs` or `m:ss.cs`). Unfilled rows for absent swimmers are cleanly ignored. The "Save Time Trial" button is disabled if any filled row is invalid.
- **Server-Side Atomic Transaction:** `times.recordBulk` executes as a single ACID transaction. If any submitted row has invalid bounds, an inactive student, or malformed time, the entire batch throws a descriptive `ConvexError` and rolls back. This prevents partial batch corruption.

### 3.2 Personal Best Tie-Breaking Rule (Gap 2)
- In competitive swimming record keeping, matching an existing PB equals the record, but is **not** a new PB drop.
- **Rule:** A new PB is detected if and only if $T_{\text{new}} < T_{\text{best}}$ (strict inequality).
- If $T_{\text{new}} == T_{\text{best}}$, `isNewPersonalBest` returns `false` (with optional `"matched_pb"` celebration in the toast UI, but no negative delta).

### 3.3 Timezone & Date Convention (Gap 3)
- All calendar dates (`timeResults.date`, `trainingGoals.targetDate`, `attendance.date`) use the ISO-8601 string format `YYYY-MM-DD`.
- This represents the **local pool calendar date**, preventing timezone shifts across UTC midnight.
- Audit timestamps (`updatedAt`, `_creationTime`) use UTC milliseconds (`Date.now()`).

### 3.4 Migration Path for Legacy Goals (Gap 4)
- **Widen & Read:** Schema fields are optional. All queries (`goals.listForStudent`, `goals.my`) treat missing `type` as `"manual"`.
- **Backfill Mutation:** Idempotent mutation `convex/goals.ts:backfillGoalTypes` patches legacy rows missing `type` to `type = "manual"`.

### 3.5 Authentication & Student Scoping for Personal Bests (Gap 5)
- `times.listForStudent` and `times.getPersonalBests`:
  - Enforce `resolveStudentAccess(ctx, args.studentId)`.
  - When called by a coach: `args.studentId` is required.
  - When called by a student: `args.studentId` is optional and defaults to the authenticated student's own ID; passing another student's ID throws `ConvexError("Not authorized")`.
  - Dedicated student-facing query `times.myPersonalBests({})` takes no ID and resolves identity directly from the auth session.

### 3.6 Goal Archival, Deletion & Student Cascade Rules (Gap 6)
- **Goal Management:**
  - `goals.remove({ goalId })`: Allows coach to delete or archive a goal.
  - `goals.setStatus`: Supports `"not_started" | "in_progress" | "completed" | "archived"`.
- **Student Cascade Policy:**
  - Swimmers are soft-deactivated via `students.update({ status: "inactive" })`, preserving all historical time records and achievements for squad history.
  - If a hard deletion is performed via admin cleanup, an internal helper deletes associated `timeResults` and `trainingGoals` records.

### 3.7 Attendance Goal Time Window (Gap 7)
- For `type: "attendance"` goals:
  - Evaluation window: from the student's `joinedAt` date (or goal creation date, whichever is later) to the goal's `targetDate` (or present date).
  - Derived percentage uses the standard domain rule: $\frac{\text{present} + \text{late}}{\text{total recorded sessions}} \times 100$.

### 3.8 Time Goal Baselines: Frozen vs Dynamic (Gap 8)
- **Baseline is Frozen at Creation:**
  - When a time goal is created, `baselineBestMs` captures the current PB at that moment in time.
  - If the swimmer has no prior times when the goal is created, `baselineBestMs` is initialized to `null`, and the **first time result recorded for that event** is automatically frozen as the baseline.
  - Freezing prevents subsequent improvements from distorting the progress percentage denominator.

### 3.9 Time Entry UI Error Formats (Gap 9)
- Input placeholder: `ss.cs (e.g. 28.45) or m:ss.cs (e.g. 1:04.25)`.
- UI Validation feedback:
  - Format mismatch: `"Enter a valid swim time (e.g. 28.45 or 1:04.25)"`.
  - Zero/Negative: `"Time must be greater than 0.00s"`.
  - Upper limit: `"Time cannot exceed 60:00.00 (1 hour)"`.

### 3.10 Index Strategy for High-Performance PB Lookups (Gap 10)
- `timeResults` composite index `by_student_and_event` (`["studentId", "stroke", "distanceMeters", "course"]`) enables $O(1)$ indexed range scans for finding minimum `timeMs`.
- Bulk operations run parallel indexed lookups via `Promise.all()`, completing in $<10\text{ms}$ for full squad batches.

### 3.11 Concurrency & Multi-Coach Safety (Gap 11)
- Because `timeResults` is an append-only log, simultaneous time trial entries from multiple coaches/devices insert independent documents without write-lock collisions.
- Derived queries naturally pick up all inserted times with zero data corruption.

### 3.12 Data Retention Policy (Gap 12)
- **Indefinite Retention:** Swim times represent permanent athlete career records and are never automatically expired or pruned.
- Erroneous entries can be deleted individually by the coach using `times.remove({ id })`.

### 3.13 Local Session Draft Cache for Bulk Time Trials (Gap 13)
- The time trial sheet persists in-progress form inputs to `sessionStorage` keyed by `draft_time_trial_${groupId}_${date}_${stroke}_${distance}_${course}`.
- If the browser tab is accidentally refreshed or closed, returning to the page immediately restores entered times with a "Draft Restored" alert.
- Submitting or clicking "Clear" wipes the draft cache.

### 3.14 Export & Reporting Requirements (Gap 14)
- Query `times.exportTimes` provides enriched records (student name, group name, formatted time string, course, context, PB flag).
- 1-Click **"Export CSV"** button on the coach times page generates standard format CSVs (`coachken-swim-times-YYYY-MM-DD.csv`) for club records and external meet software.

### 3.15 Course Conversion Policy (Gap 15)
- **Strict Course Isolation:** Short Course (25m SCM) and Long Course (50m LCM) are treated as **completely separate event records**.
- An SCM 50m Free PB does not overwrite or compare against an LCM 50m Free PB.
- The UI displays SCM and LCM in separate segmented views / tabs.

---

## 4. Mathematical Formulations & Parsing

### 4.1 Time Parsing & Formatting (`lib/format.ts`)
- **Storage:** Integer milliseconds ($1 \text{ s} = 1000 \text{ ms}$).
- **Parsing (`parseTimeToMs(input: string): number | null`):**
  - Accepts `"28.45"`, `"1:04.25"`, `"01:04.25"`, `"18:30.12"`.
  - Rejects inputs $\le 0$ or $> 3,600,000\text{ ms}$.
- **Formatting (`formatTimeMs(ms: number): string`):**
  - $< 60,000\text{ ms}$: `"28.45"`
  - $\ge 60,000\text{ ms}$: `"1:04.25"`

### 4.2 Personal Best Derivation
- Let Event $E = (\text{stroke}, \text{distanceMeters}, \text{course})$.
- $$\text{PB}(s, E) = \min \{ r.\text{timeMs} \mid r \in \text{timeResults}, r.\text{studentId} = s, r.\text{event} = E \}$$
- **Delta Calculation on New PB:**
  $$\Delta\text{Ms} = T_{\text{prev}} - T_{\text{new}}$$
  $$\Delta\text{Pct} = \frac{\Delta\text{Ms}}{T_{\text{prev}}} \times 100$$

### 4.3 Goal Progress Derivation (Goals v2)
#### 1. Time Goal (`type === "time"`):
- Let $B = \text{baselineBestMs}$, $T = \text{targetTimeMs}$, $C = \text{currentBestMs}$.
- If $C \le T \implies \text{Progress} = 100\%$ (Status auto-completed).
- Else:
  $$\text{Progress} = \text{clamp}\left(\text{round}\left(\frac{B - C}{B - T} \times 100\right), 0, 100\right)$$

#### 2. Attendance Goal (`type === "attendance"`):
- Let $A = \text{currentAttendancePct}$, $T = \text{targetAttendancePct}$.
- If $A \ge T \implies \text{Progress} = 100\%$ (Status auto-completed).
- Else:
  $$\text{Progress} = \text{clamp}\left(\text{round}\left(\frac{A}{T} \times 100\right), 0, 100\right)$$

---

## 5. Backend API Specifications (`convex/`)

### 5.1 `convex/times.ts`

| Function | Type | Access | Args | Description |
| :--- | :--- | :--- | :--- | :--- |
| `create` | Mutation | Coach | `{ studentId, date, distanceMeters, stroke, course, timeMs, context, notes? }` | Validates event, inserts time result, evaluates PB, auto-completes goals, returns PB delta payload. |
| `recordBulk` | Mutation | Coach | `{ groupId, date, distanceMeters, stroke, course, context, entries: [{ studentId, timeMs, notes? }] }` | Bulk inserts time trial results for group in one transaction, returns PB achievements list. |
| `remove` | Mutation | Coach | `{ id: v.id("timeResults") }` | Deletes a time record (PBs and goals re-derive dynamically). |
| `listForStudent` | Query | Coach / Own Student | `{ studentId?: v.id("students"), stroke?: v.string(), distanceMeters?: v.number(), course?: v.string() }` | Returns chronological list of time results with PB tags. |
| `getPersonalBests` | Query | Coach / Own Student | `{ studentId?: v.id("students") }` | Returns map of current Personal Bests per event with date and time drop history. |
| `myPersonalBests` | Query | Student | `{}` | Dedicated student query resolving own PBs from auth session. |
| `listRecent` | Query | Coach | `{ groupId?: v.id("groups"), limit?: v.number() }` | Returns squad-wide recent times for activity feed and dashboard. |
| `exportTimes` | Query | Coach | `{ studentId?, groupId?, startDate?, endDate?, stroke?, distanceMeters?, course?, context? }` | Enriched time results query for CSV export. |

### 5.2 `convex/goals.ts` Updates

| Function | Changes |
| :--- | :--- |
| `create` | Extended args to accept `type`, `distanceMeters`, `stroke`, `course`, `targetTimeMs`, `targetAttendancePct`, `baselineBestMs`. If `baselineBestMs` is omitted for a time goal, auto-resolves current PB. |
| `update` | Allows updating targets, description, baseline, and manual progress. |
| `remove` | Deletes or archives a goal. |
| `listForStudent` | Enriches each goal with derived progress %, `currentBestMs`, `currentAttendancePct`, and computed status. |
| `my` | Enriches caller's student goals with the same derived progress metrics. |
| `backfillGoalTypes` | Idempotent migration setting missing `type` to `"manual"`. |

---

## 6. User Interface & Flow Specifications

### 6.1 Coach Hub: `app/coach/times/page.tsx`
1. **Time Trial Sheet (Bulk Entry):**
   - Header Controls: Group, Event (Stroke + Distance), Course (SCM 25m / LCM 50m), Date, Context.
   - Table of active group members with pre-filled inputs and autofocus navigation.
   - Live session draft recovery via `sessionStorage`.
   - Single "Save Time Trial" button with batch PB achievement summary modal/toast.
2. **Squad Time Log & PB Directory:**
   - Filters by Group, Stroke, Distance, Course, Context.
   - Sortable table of all time results across the team.
   - "Export CSV" button.

### 6.2 Swimmer Profile Tab: `Times & PBs`
- **Trophy Shelf:** Grid of Personal Best cards grouped by stroke (Freestyle, Backstroke, Breaststroke, Butterfly, IM) with course toggle.
- **Event History Accordion:** Click on an event card to view historical timeline of times recorded with dates and percentage improvements.
- **Log Time Button:** Opens quick dialog to record a single competition or practice time.

### 6.3 Goal Management: `app/coach/goals/page.tsx`
- Upgraded "New Goal" dialog with 3 segmented goal types:
  1. **Time Goal:** Select Event, Course, Target Time. Shows current PB as baseline with option to adjust.
  2. **Attendance Goal:** Set target attendance % (e.g. `90%`).
  3. **Custom Goal:** Free text target with manual progress slider.
- Goal list cards display derived progress bars with badges indicating `"Computed from PB"` or `"Computed from Attendance"`.

### 6.4 Student Portal Experience
- **`app/student/times/page.tsx`:** Dedicated "My Personal Bests" view with event cards and progression history.
- **`app/student/dashboard/page.tsx`:** Celebratory "Latest Personal Best" highlight card.
- **`app/student/goals/page.tsx`:** Live auto-updating goal progress with visual target vs current difference.

### 6.5 Coach Dashboard Shortcut
- Adds a "Run Time Trial" quick-action button in the coach dashboard action header.

---

## 7. Testing Strategy (`vitest` + `convex-test`)

Automated backend test suites to create:
1. `convex/times-crud.test.ts`: Single time creation, event validation, course validation, deletion, permissions.
2. `convex/times-pb.test.ts`: PB detection logic on faster times, strict inequality tie handling, delta ms/percentage math, SCM vs LCM separation.
3. `convex/times-bulk.test.ts`: Bulk group time trial recording, atomic rollback on error, batch PB return payload.
4. `convex/goals-measurable.test.ts`: Dynamic time goal progress derivation (frozen baseline, 0%, proportional %, 100% on target beat), dynamic attendance goal progress derivation, auto-completion trigger when new PB beats target time.
5. `convex/times-export.test.ts`: CSV export query filtering by group, date range, and event.
