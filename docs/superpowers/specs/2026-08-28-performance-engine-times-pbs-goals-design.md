# CoachKen Tracker — Performance Engine (Times, Personal Bests & Measurable Goals v2) Design

Date: 2026-08-28  
Status: Draft (Pending User Review)  
Owner: CoachKen Tracker  
Phase: Phase 2 (Performance)

---

## 1. Purpose

Turn CoachKen Tracker into a competitive swim performance system. Swimming is fundamentally measured in hundredths of a second. This design introduces:
1. **Append-Only Time Tracking:** Record swim times across official distances, courses (SCM/LCM), and contexts (practice, time trial, meet).
2. **Instant Multi-Swimmer Time Trial Sheet:** Enter times for an entire group in a single fast tabular interface.
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
  date: v.string(), // YYYY-MM-DD
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
  updatedAt: v.number(),
})
  .index("by_student_and_event", ["studentId", "stroke", "distanceMeters", "course"])
  .index("by_student_and_date", ["studentId", "date"])
  .index("by_date", ["date"]),
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
  baselineBestMs: v.optional(v.number()), // Captured at goal creation
  
  // Fields for type === "attendance"
  targetAttendancePct: v.optional(v.number()), // 1 - 100
  
  // Legacy / manual fields
  target: v.optional(v.string()),
  progress: v.number(), // 0 - 100 (for manual goals or fallback)
  status: v.union(
    v.literal("not_started"),
    v.literal("in_progress"),
    v.literal("completed")
  ),
  targetDate: v.optional(v.string()), // YYYY-MM-DD
  updatedAt: v.number(),
}).index("by_student_and_updated", ["studentId", "updatedAt"]),
```

#### 3. Skills Catalog Update
Ensure `"im"` (Individual Medley) is added to the skills catalog and stroke validator constants alongside `freestyle`, `backstroke`, `breaststroke`, and `butterfly`.

---

## 3. Core Logic & Mathematical Formulations

### 3.1 Time Parsing and Formatting (`lib/format.ts`)
- **Storage:** Integer milliseconds ($1 \text{ second} = 1000 \text{ ms}$).
- **Parsing (`parseTimeToMs(input: string): number | null`):**
  - `"28.45"` $\to 28450\text{ ms}$
  - `"1:04.25"` or `"01:04.25"` $\to 64250\text{ ms}$
  - `"18:30.12"` $\to 1110120\text{ ms}$
  - Rejects negative times or values $> 3,600,000\text{ ms}$ ($1\text{ hour}$).
- **Formatting (`formatTimeMs(ms: number): string`):**
  - $< 60000\text{ ms}$: `"ss.cs"` (e.g., `"28.45"`)
  - $\ge 60000\text{ ms}$: `"m:ss.cs"` (e.g., `"1:04.25"`)

### 3.2 Personal Best (PB) Derivation
- An **Event** is uniquely identified by `(stroke, distanceMeters, course)`.
- A swimmer's **Personal Best** for an event is:
  $$\text{PB}(s, e) = \min \{ r.\text{timeMs} \mid r \in \text{timeResults}, r.\text{studentId} = s, r.\text{event} = e \}$$
- **PB Detection on Create:**
  When inserting a new time result $r_{\text{new}}$:
  1. Fetch existing best time $T_{\text{prev}} = \min(\text{existing times for that event})$.
  2. If no prior time exists: $r_{\text{new}}$ is the first time (and the baseline PB).
  3. If $r_{\text{new}}.\text{timeMs} < T_{\text{prev}}$:
     $$\Delta\text{Ms} = T_{\text{prev}} - r_{\text{new}}.\text{timeMs}$$
     $$\Delta\text{Pct} = \frac{\Delta\text{Ms}}{T_{\text{prev}}} \times 100$$
     Mark `isNewPersonalBest: true` and return celebration payload `{ isNewPersonalBest: true, previousBestMs: T_prev, deltaMs, deltaPct }`.

### 3.3 Goal Progress Derivation (Goals v2)
Progress is dynamically computed on query reads:

#### 1. Time Goal (`type === "time"`):
- Let $B = \text{baselineBestMs}$ and $T = \text{targetTimeMs}$ ($T < B$).
- Let $C = \text{currentBestMs}$ (fastest time recorded to date for this event).
- If no times have been recorded yet:
  $$\text{Progress} = 0\%$$
- If $C \le T$:
  $$\text{Progress} = 100\% \quad (\text{Goal Completed})$$
- Otherwise:
  $$\text{Progress} = \text{clamp}\left(\text{round}\left(\frac{B - C}{B - T} \times 100\right), 0, 100\right)$$

#### 2. Attendance Goal (`type === "attendance"`):
- Let $A = \text{currentAttendancePct}$ (attended sessions $\div$ total recorded attendance sessions).
- Let $T = \text{targetAttendancePct}$.
- If $A \ge T$:
  $$\text{Progress} = 100\% \quad (\text{Goal Completed})$$
- Otherwise:
  $$\text{Progress} = \text{clamp}\left(\text{round}\left(\frac{A}{T} \times 100\right), 0, 100\right)$$

#### 3. Manual Goal (`type === "manual"` or missing):
- Stored `progress` value ($0 - 100$).

### 3.4 Auto-Completion Trigger Helper
When `timeResults.create`, `timeResults.recordBulk`, `attendance.record`, or `attendance.recordBulk` executes:
- Run an internal helper `checkAndAutoCompleteGoals(ctx, studentId)`.
- If a goal's derived progress reaches $100\%$, patch its status from `"in_progress"` or `"not_started"` to `"completed"`.

---

## 4. Backend API Specifications (`convex/`)

### 4.1 `convex/times.ts`

| Function | Type | Access | Args | Description |
| :--- | :--- | :--- | :--- | :--- |
| `create` | Mutation | Coach | `{ studentId, date, distanceMeters, stroke, course, timeMs, context, notes? }` | Validates event, inserts time result, evaluates PB, auto-completes goals, returns PB delta payload. |
| `recordBulk` | Mutation | Coach | `{ groupId, date, distanceMeters, stroke, course, context, entries: [{ studentId, timeMs, notes? }] }` | Bulk inserts time trial results for all swimmers in a group, returns array of PB achievements. |
| `remove` | Mutation | Coach | `{ id: v.id("timeResults") }` | Deletes a time record (PBs and goals re-derive dynamically). |
| `listForStudent` | Query | Coach / Own Student | `{ studentId?: v.id("students"), stroke?: v.string(), distanceMeters?: v.number(), course?: v.string() }` | Returns chronological list of time results with PB tags. |
| `getPersonalBests` | Query | Coach / Own Student | `{ studentId?: v.id("students") }` | Returns map/array of current Personal Bests per event with date and time drop history. |
| `listRecent` | Query | Coach | `{ groupId?: v.id("groups"), limit?: v.number() }` | Returns squad-wide recent times for the coach activity feed and times dashboard. |

### 4.2 `convex/goals.ts` Updates

| Function | Changes |
| :--- | :--- |
| `create` | Extended args to accept `type`, `distanceMeters`, `stroke`, `course`, `targetTimeMs`, `targetAttendancePct`, `baselineBestMs`. If `baselineBestMs` is omitted for a time goal, auto-resolves the student's current PB. |
| `update` | Allows updating targets, description, baseline, and manual progress. |
| `listForStudent` | Enriches each goal with derived progress %, `currentBestMs` (for time goals), `currentAttendancePct` (for attendance goals), and computed status. |
| `my` | Enriches caller's student goals with the same derived progress metrics. |

---

## 5. User Interface & Flow Specifications

### 5.1 Coach Hub: `app/coach/times/page.tsx`
A unified performance tracking center with two main tabs:
1. **Time Trial Sheet (Bulk Entry):**
   - Selector: Group, Event (Stroke + Distance), Course (SCM 25m / LCM 50m), Date, Context (`time_trial` / `practice` / `meet`).
   - Table of active group members with pre-filled inputs and autofocus navigation.
   - Quick time entry formatted as `28.45` or `1:04.25`.
   - Single "Save Time Trial" button.
   - On save: Displays toast summary with badges for any new Personal Bests achieved during the trial.
2. **Squad Time Log & PB Directory:**
   - Filters by Group, Stroke, Distance, Course.
   - Sortable table of all time results across the team.
   - Quick action to delete or log a single time.

### 5.2 Swimmer Profile Tab: `Times & PBs`
- **Trophy Shelf:** Grid of Personal Best cards grouped by stroke (Freestyle, Backstroke, Breaststroke, Butterfly, IM).
- **Event History Accordion:** Click on an event card to view historical timeline of times recorded with dates and percentage improvements.
- **Log Time Button:** Opens quick dialog to record a single competition or practice time.

### 5.3 Goal Management: `app/coach/goals/page.tsx`
- Upgraded "New Goal" dialog with 3 segmented goal types:
  1. **Time Goal:** Select Event, Course, Target Time (e.g. `29.50`). Shows current PB as baseline with option to adjust.
  2. **Attendance Goal:** Set target attendance % (e.g. `90%`).
  3. **Custom Goal:** Free text target with manual progress slider.
- Goal list cards display derived progress bars with badges indicating `"Computed from PB"` or `"Computed from Attendance"`.

### 5.4 Student Portal Experience
- **`app/student/times/page.tsx`:** Dedicated "My Personal Bests" view with event cards and progression history.
- **`app/student/dashboard/page.tsx`:** Adds a celebratory "Latest Personal Best" highlight card (e.g., `🎉 New PB in 50m Freestyle: 28.45s (-1.2s)`).
- **`app/student/goals/page.tsx`:** Shows live auto-updating goal progress with visual target vs current difference.

### 5.5 Coach Dashboard Shortcut
- Adds a "Run Time Trial" quick-action button in the coach dashboard action header.

---

## 6. Validation, Access Control & Safety

1. **Access Control (`lib/access.ts`):**
   - Coach-only mutations: `timeResults.create`, `timeResults.recordBulk`, `timeResults.remove`.
   - Student queries enforce `resolveStudentAccess` — students can only query their own time results and goals.
2. **Data Validation (`lib/validation.ts`):**
   - `assertTimeMs(ms)`: Integer between $1\text{ ms}$ and $3,600,000\text{ ms}$.
   - `assertEventDistance(dist)`: Must be one of `[25, 50, 100, 200, 400, 800, 1500]`.
   - `assertCourse(course)`: Must be `"short"` or `"long"`.
   - `assertStroke(stroke)`: Must be in stroke catalog (`freestyle`, `backstroke`, `breaststroke`, `butterfly`, `im`).
3. **Idempotency & Resilience:**
   - Deleting a time result cleanly re-evaluates PBs and goal progress without leaving orphan cache records.

---

## 7. Testing Strategy (`vitest` + `convex-test`)

Automated backend test suites to create:
1. `convex/times-crud.test.ts`:
   - Single time creation, event validation, course validation.
   - Deletion and permissions (student blocked from writes).
2. `convex/times-pb.test.ts`:
   - PB detection logic on faster times.
   - Delta ms and delta percentage math.
   - Multiple events and course separation (SCM vs LCM PBs are distinct).
3. `convex/times-bulk.test.ts`:
   - Bulk group time trial recording.
   - Skipping empty entries, verifying batch PB returns.
4. `convex/goals-measurable.test.ts`:
   - Dynamic time goal progress derivation (0% when no times, proportional %, 100% on target beat).
   - Dynamic attendance goal progress derivation.
   - Auto-completion trigger when new PB beats target time.

---

## 8. Out of Scope for Phase 2

- Video split analysis (deferred to Phase 4 / P3).
- Team leaderboards and public rankings (Phase 4).
- In-app multi-lane tap stopwatch hardware integration (deferred).
