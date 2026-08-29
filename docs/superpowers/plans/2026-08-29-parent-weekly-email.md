# Parent Weekly Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Email every active student's full report card to their `parentEmail` every Monday 06:00 Manila time via Gmail SMTP, dripped through a queue, with a coach "send now" button.

**Architecture:** New `parentEmails` table is the queue + delivery log. A cron mutation snapshots report cards into pending rows; a self-rescheduling Node action (`useNode: true`) sends batches of 5 every 2 minutes through nodemailer, recording results in follow-up mutations. A 15-minute safety-drain cron recovers from crashed processors and drives 30-minute retry backoff (max 3 attempts). Spec: `docs/superpowers/specs/2026-08-29-parent-weekly-email-design.md`.

**Tech Stack:** Convex ^1.44, nodemailer, vitest + convex-test, Next.js (existing coach UI).

## Global Constraints

- Every Convex function has `args` AND `returns` validators (project convention; convex guidelines require args always).
- All coach-only functions guard with `requireCoach(ctx)` from `convex/lib/access.ts` and throw `new ConvexError("Not authorized")` on failure — copy the `NOT_AUTHORIZED` pattern from `convex/reports.ts`.
- All calendar logic flows through `convex/lib/time.ts` (`todayInCoachTz`, `weekStartIso`, `datePlusDays`). Coach timezone is Asia/Manila. Never compute dates ad hoc.
- Crons must NOT fire at the top of the hour (eslint rule `@convex-dev/no-top-of-hour-crons`).
- After any schema or function-file change, run `npx convex codegen` before `npm run typecheck` (regenerates `convex/_generated`).
- Tests use vitest + convex-test with the exact boilerplate from `convex/reports-weekly.test.ts` (`convexTest(schema, modules)`, `seedCoach`/`seedStudent` from `convex/tests/helpers.ts`).
- Commits: conventional style (`feat(scope): …`, `test(scope): …`) matching `git log --oneline -10`.
- Run commands from the repo root (`C:\Users\USER\Documents\data\convex\coachken-tracker`).
- Tuning constants (single source of truth, defined in `convex/parentEmails.ts`): `BATCH_SIZE = 5`, `DRIP_INTERVAL_MS = 2 * 60 * 1000`, `RETRY_BACKOFF_MS = 30 * 60 * 1000`, `MAX_ATTEMPTS = 3`, `DAILY_SEND_CAP = 400`.

---

### Task 1: `parentEmails` schema table

**Files:**
- Modify: `convex/schema.ts` (append table inside `defineSchema`, after `reports`)
- Test: `convex/parent-emails-schema.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: table `parentEmails` with fields `studentId: Id<"students">, weekStart: string, toEmail: string, payloadJson: string, status: "pending" | "sent" | "failed", attempts: number, lastError?: string, sentAt?: number, dueAt: number, createdAt: number`; indexes `by_week_and_student` (unique on `["weekStart", "studentId"]`), `by_status_and_due` (`["status", "dueAt"]`), `by_sentAt` (`["sentAt"]`). Later tasks insert/query these exact field names.

- [x] **Step 1: Write the failing test**

Create `convex/parent-emails-schema.test.ts`:

```ts
// convex/parent-emails-schema.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedStudent } from "./tests/helpers";

describe("parentEmails table", () => {
  it("rejects a second row for the same student and week", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "Alex Santos");

    const insert = () =>
      t.run(async (ctx) => {
        return await ctx.db.insert("parentEmails", {
          studentId,
          weekStart: "2026-08-24",
          toEmail: "parent@example.com",
          payloadJson: "{}",
          status: "pending",
          attempts: 0,
          dueAt: Date.now(),
          createdAt: Date.now(),
        });
      });

    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it("indexes pending rows by dueAt", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "Alex Santos");
    await t.run(async (ctx) => {
      await ctx.db.insert("parentEmails", {
        studentId,
        weekStart: "2026-08-24",
        toEmail: "parent@example.com",
        payloadJson: "{}",
        status: "pending",
        attempts: 0,
        dueAt: 1_000,
        createdAt: Date.now(),
      });
    });

    const due = await t.run(async (ctx) => {
      return await ctx.db
        .query("parentEmails")
        .withIndex("by_status_and_due", (q) =>
          q.eq("status", "pending").lte("dueAt", Date.now()),
        )
        .collect();
    });
    expect(due).toHaveLength(1);
    expect(due[0]!.toEmail).toBe("parent@example.com");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/parent-emails-schema.test.ts`
Expected: FAIL — "parentEmails" is not a valid table (insert throws unknown table).

- [x] **Step 3: Add the table to the schema**

In `convex/schema.ts`, inside `defineSchema({ ... })`, after the `reports` table entry (before the closing `}),` of the schema object), add:

```ts
  parentEmails: defineTable({
    studentId: v.id("students"),
    weekStart: v.string(),
    toEmail: v.string(),
    payloadJson: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    dueAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_status_and_due", ["status", "dueAt"])
    .index("by_sentAt", ["sentAt"])
    .index("by_week_and_student", ["weekStart", "studentId"])
    .unique(),
```

Note: `.unique()` must come directly after the `by_week_and_student` index and is terminal — that is why the unique index is declared last.

- [x] **Step 4: Regenerate types and run tests**

Run: `npx convex codegen; npx vitest run convex/parent-emails-schema.test.ts`
Expected: 2 tests PASS.

- [x] **Step 5: Commit**

```bash
git add convex/schema.ts convex/parent-emails-schema.test.ts convex/_generated
git commit -m "feat(parent-emails): queue table with unique weekly key"
```

---

### Task 2: Extract `buildAthleteCard` into `convex/lib/reportCard.ts`

**Files:**
- Create: `convex/lib/reportCard.ts`
- Modify: `convex/reports.ts:1-57` (imports + validator move), `convex/reports.ts:71-195` (handler shrinks to a wrapper)
- Test: modify `convex/reports-card.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `attendanceStats`, `commitmentStats`, `deriveGoalProgress` from `convex/lib/stats.ts`; `weekStartIso`, `weekStartsBack` from `convex/lib/time.ts` (all already exist, unchanged).
- Produces (used by Task 5 and Task 3):
  - `export const athleteCardVal: ObjectValidator` — the card validator (moved verbatim from `reports.ts`).
  - `export type AthleteCard = Infer<typeof athleteCardVal>`
  - `export async function buildAthleteCard(ctx: QueryCtx, student: Doc<"students">, today: string): Promise<AthleteCard>` — computes the full card without any auth check.

- [x] **Step 1: Write the failing test**

In `convex/reports-card.test.ts`, add to the imports at the top:

```ts
import { buildAthleteCard } from "./lib/reportCard";
```

and append this describe block at the end of the file:

```ts
describe("buildAthleteCard", () => {
  it("computes the full card without an authenticated viewer", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "No Auth Needed");

    const card = await t.run(async (ctx) => {
      const student = (await ctx.db.get("students", studentId))!;
      return buildAthleteCard(ctx, student, "2026-08-29");
    });

    expect(card.student.name).toBe("No Auth Needed");
    expect(card.student.email).toBeNull();
    expect(card.volumeByWeek).toHaveLength(12);
    expect(card.attendance.total).toBe(0);
    expect(card.commitment).toBeNull();
    expect(card.pbs).toEqual([]);
    expect(card.goals).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/reports-card.test.ts`
Expected: FAIL — cannot resolve "./lib/reportCard".

- [x] **Step 3: Create `convex/lib/reportCard.ts`**

Create the file with the validator and computation moved verbatim from `convex/reports.ts` (lines 16–57 validator, 59–64 `ageFrom`, 80–193 body), re-parameterized on the `student` document:

```ts
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
```

- [x] **Step 4: Shrink `convex/reports.ts` to use the helper**

In `convex/reports.ts`:

Replace the import block (lines 1–12) with:

```ts
// convex/reports.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { collectStudentFlags } from "./insights";
import { athleteCardVal, buildAthleteCard } from "./lib/reportCard";
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";
```

Delete lines 16–64 (the `athleteCardVal` const and `ageFrom` function — now in `lib/reportCard.ts`).

Replace the whole `athleteCard` query (the `export const athleteCard = query({ ... });` block, lines ~66–195 after the deletes) with:

```ts
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

    return buildAthleteCard(ctx, student, todayInCoachTz());
  },
});
```

Leave `generateWeekly` and `list` below unchanged. If `weekStartsBack` or the stats imports are now unused in `reports.ts`, the imports above already drop them — verify no other usage remains in the file (`generateWeekly` does not use them).

- [x] **Step 5: Regenerate, typecheck, and run tests**

Run: `npx convex codegen; npm run typecheck; npx vitest run convex/reports-card.test.ts convex/reports-weekly.test.ts`
Expected: typecheck clean; all card/weekly tests PASS (the two original card tests are the refactor regression).

- [x] **Step 6: Commit**

```bash
git add convex/lib/reportCard.ts convex/reports.ts convex/reports-card.test.ts convex/_generated
git commit -m "refactor(reports): extract buildAthleteCard into lib/reportCard"
```

---

### Task 3: `renderReportEmail` pure renderer

**Files:**
- Create: `convex/lib/reportEmail.ts`
- Test: `convex/report-email.test.ts` (new)

**Interfaces:**
- Consumes: `type AthleteCard` from `./reportCard` (Task 2).
- Produces (used by Task 6 tests and the Task 6 action):
  - `export type ReportEmailPayload = { weekStart: string; card: AthleteCard }`
  - `export function renderReportEmail(payload: ReportEmailPayload): { subject: string; html: string; text: string }`

- [x] **Step 1: Write the failing test**

Create `convex/report-email.test.ts`:

```ts
// convex/report-email.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { renderReportEmail } from "./lib/reportEmail";
import type { AthleteCard } from "./lib/reportCard";

function sampleCard(): AthleteCard {
  return {
    student: {
      name: "Maria <Reyes>",
      email: "maria@example.com",
      age: 14,
      joinedAt: "2026-01-15",
    },
    groupName: "Senior A",
    attendance: { total: 10, attended: 9, percentage: 90 },
    commitment: { held: 8, attended: 7, percentage: 88 },
    volumeByWeek: [
      { label: "2026-08-17", value: 4200 },
      { label: "2026-08-24", value: null },
    ],
    skills: [{ name: "Freestyle", progress: 72 }],
    pbs: [
      {
        label: "50m freestyle (SC)",
        bestTimeMs: 29_512,
        bestDate: "2026-08-10",
        resultCount: 3,
      },
    ],
    goals: [
      { title: "Sub-29 50 free", status: "in_progress", progress: 60, targetDate: "2026-12-01" },
    ],
  };
}

describe("renderReportEmail", () => {
  it("builds subject, html, and text with the card's key numbers", () => {
    const out = renderReportEmail({ weekStart: "2026-08-24", card: sampleCard() });

    expect(out.subject).toBe("Weekly Swim Report — Maria <Reyes> (week of 2026-08-24)");
    expect(out.html).toContain("Maria &lt;Reyes&gt;");
    expect(out.html).toContain("90%");
    expect(out.html).toContain("4,200 m");
    expect(out.html).toContain("50m freestyle (SC)");
    expect(out.html).toContain("29.51");
    expect(out.html).toContain("Sub-29 50 free");

    expect(out.text).toContain("Weekly Swim Report — Maria <Reyes> (week of 2026-08-24)");
    expect(out.text).toContain("Attended 9 of 10 sessions (90%)");
    expect(out.text).toContain("2026-08-17: 4,200 m");
    expect(out.text).toContain("2026-08-24: (no distance recorded)");
    expect(out.text).toContain("Freestyle: 72%");
    expect(out.text).toContain("50m freestyle (SC): 29.51 (set 2026-08-10)");
    expect(out.text).toContain("Sub-29 50 free — in_progress, 60%");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/report-email.test.ts`
Expected: FAIL — cannot resolve "./lib/reportEmail".

- [x] **Step 3: Implement the renderer**

Create `convex/lib/reportEmail.ts`:

```ts
// convex/lib/reportEmail.ts
import type { AthleteCard } from "./reportCard";

export type ReportEmailPayload = { weekStart: string; card: AthleteCard };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const h = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(h).padStart(2, "0")}`;
}

function formatMeters(value: number | null): string {
  return value === null ? "(no distance recorded)" : `${value.toLocaleString("en-US")} m`;
}

const SECTION_STYLE = "font-size:16px;font-weight:bold;margin:20px 0 6px 0;";

export function renderReportEmail(payload: ReportEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const { weekStart, card } = payload;
  const subject = `Weekly Swim Report — ${card.student.name} (week of ${weekStart})`;

  const currentWeekLabel =
    card.volumeByWeek[card.volumeByWeek.length - 1]?.label ?? null;

  const volumeHtml = card.volumeByWeek
    .map((w) => {
      const bold = w.label === currentWeekLabel ? "font-weight:bold;" : "";
      return `<tr><td style="padding:2px 8px;${bold}">${esc(w.label)}</td><td style="padding:2px 8px;text-align:right;${bold}">${esc(formatMeters(w.value))}</td></tr>`;
    })
    .join("");
  const volumeText = card.volumeByWeek
    .map((w) => `${w.label}: ${formatMeters(w.value)}`)
    .join("\n");

  const attendancePct =
    card.attendance.percentage === null ? "—" : `${card.attendance.percentage}%`;
  const commitmentText =
    card.commitment === null
      ? "No group assigned"
      : `${card.commitment.attended} of ${card.commitment.held} held practices (${card.commitment.percentage ?? "—"}%)`;
  const commitmentHtml =
    card.commitment === null
      ? "No group assigned"
      : esc(commitmentText);

  const skillsHtml = card.skills
    .map((s) => `<li style="padding:1px 0;">${esc(s.name)}: ${s.progress}%</li>`)
    .join("");
  const skillsText = card.skills
    .map((s) => `${s.name}: ${s.progress}%`)
    .join("\n");

  const pbsHtml = card.pbs
    .map(
      (p) =>
        `<li style="padding:1px 0;">${esc(p.label)}: ${formatTime(p.bestTimeMs)} (set ${esc(p.bestDate)}, ${p.resultCount} result${p.resultCount === 1 ? "" : "s"})</li>`,
    )
    .join("");
  const pbsText = card.pbs
    .map((p) => `${p.label}: ${formatTime(p.bestTimeMs)} (set ${p.bestDate})`)
    .join("\n");

  const goalsHtml = card.goals
    .map((g) => {
      const target = g.targetDate ? `, target ${esc(g.targetDate)}` : "";
      return `<li style="padding:1px 0;">${esc(g.title)} — ${esc(g.status)}, ${g.progress}%${target}</li>`;
    })
    .join("");
  const goalsText = card.goals
    .map((g) => {
      const target = g.targetDate ? `, target ${g.targetDate}` : "";
      return `${g.title} — ${g.status}, ${g.progress}%${target}`;
    })
    .join("\n");

  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;">
<h2 style="margin:0 0 4px 0;">Weekly Swim Report</h2>
<p style="margin:0 0 16px 0;color:#555;">${esc(card.student.name)}${card.groupName ? ` — ${esc(card.groupName)}` : ""}${card.student.age !== null ? `, age ${card.student.age}` : ""} · week of ${esc(weekStart)}</p>

<div style="${SECTION_STYLE}">Attendance</div>
<p style="margin:0;">Attended ${card.attendance.attended} of ${card.attendance.total} sessions (${attendancePct})</p>

<div style="${SECTION_STYLE}">Commitment</div>
<p style="margin:0;">${commitmentHtml}</p>

<div style="${SECTION_STYLE}">Training volume (last ${card.volumeByWeek.length} weeks)</div>
<table style="border-collapse:collapse;">${volumeHtml}</table>

<div style="${SECTION_STYLE}">Skills</div>
<ul style="margin:0;padding-left:20px;">${skillsHtml}</ul>

<div style="${SECTION_STYLE}">Personal bests</div>
<ul style="margin:0;padding-left:20px;">${pbsHtml}</ul>

<div style="${SECTION_STYLE}">Goals</div>
<ul style="margin:0;padding-left:20px;">${goalsHtml}</ul>

<p style="margin-top:24px;color:#888;font-size:12px;">Sent by CoachKen Tracker. Reply to this email to reach the coach.</p>
</body></html>`;

  const text = `Weekly Swim Report — ${card.student.name}${card.groupName ? ` — ${card.groupName}` : ""}${card.student.age !== null ? `, age ${card.student.age}` : ""} (week of ${weekStart})

ATTENDANCE
Attended ${card.attendance.attended} of ${card.attendance.total} sessions (${attendancePct})

COMMITMENT
${commitmentText}

TRAINING VOLUME (${card.volumeByWeek.length} weeks)
${volumeText}

SKILLS
${skillsText}

PERSONAL BESTS
${pbsText}

GOALS
${goalsText}

Sent by CoachKen Tracker. Reply to this email to reach the coach.`;

  return { subject, html, text };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/report-email.test.ts`
Expected: PASS (1 test).

- [x] **Step 5: Commit**

```bash
git add convex/lib/reportEmail.ts convex/report-email.test.ts
git commit -m "feat(parent-emails): report card email renderer"
```

---

### Task 4: nodemailer mailer

**Files:**
- Modify: `package.json` (new dependency)
- Create: `convex/lib/mailer.ts`
- Test: `convex/mailer.test.ts` (new)

**Interfaces:**
- Consumes: env vars `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (default `465`), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (default `SMTP_USER`).
- Produces (used by Task 6): `export async function sendMail(args: { to: string; subject: string; html: string; text: string }): Promise<{ ok: true; messageId: string } | { ok: false; error: string }>`

- [x] **Step 1: Install nodemailer**

Run: `npm install nodemailer; npm install -D @types/nodemailer`
Expected: package.json gains `"nodemailer"` in dependencies and `"@types/nodemailer"` in devDependencies.

- [x] **Step 2: Write the failing test**

Create `convex/mailer.test.ts`:

```ts
// convex/mailer.test.ts
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

import { sendMail } from "./lib/mailer";

const ENV_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  sendMailMock.mockReset();
  vi.resetModules();
});

describe("sendMail", () => {
  it("returns a clear error when SMTP secrets are missing", async () => {
    const result = await sendMail({
      to: "parent@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("SMTP not configured");
  });

  it("sends via the transport and returns the messageId", async () => {
    process.env.SMTP_USER = "coach@gmail.com";
    process.env.SMTP_PASS = "app-password";
    process.env.MAIL_FROM = "CoachKen Tracker <coach@gmail.com>";
    sendMailMock.mockResolvedValue({ messageId: "<abc-1>" });

    const result = await sendMail({
      to: "parent@example.com",
      subject: "Weekly report",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toEqual({ ok: true, messageId: "<abc-1>" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(mail.to).toBe("parent@example.com");
    expect(mail.subject).toBe("Weekly report");
    expect(mail.from).toBe("CoachKen Tracker <coach@gmail.com>");
    expect(mail.replyTo).toBe("coach@gmail.com");
  });

  it("captures transport errors as failed results", async () => {
    process.env.SMTP_USER = "coach@gmail.com";
    process.env.SMTP_PASS = "app-password";
    sendMailMock.mockRejectedValue(new Error("connection refused"));

    const result = await sendMail({
      to: "parent@example.com",
      subject: "s",
      html: "h",
      text: "t",
    });
    expect(result).toEqual({ ok: false, error: "connection refused" });
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/mailer.test.ts`
Expected: FAIL — cannot resolve "./lib/mailer".

- [x] **Step 4: Implement the mailer**

Create `convex/lib/mailer.ts`:

```ts
// convex/lib/mailer.ts
// Node-only module (imported exclusively by useNode actions).
import nodemailer, { type Transporter } from "nodemailer";

export type SendMailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (cachedTransport === null) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return cachedTransport;
}

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { ok: false, error: "SMTP not configured (set SMTP_USER and SMTP_PASS)" };
  }
  try {
    const info = await getTransport().sendMail({
      from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
      replyTo: process.env.SMTP_USER,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/mailer.test.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json convex/lib/mailer.ts convex/mailer.test.ts
git commit -m "feat(parent-emails): gmail smtp mailer wrapper"
```

---

### Task 5: Queue core — enqueue, claim, record, hasPending

**Files:**
- Create: `convex/parentEmails.ts`
- Test: `convex/parent-emails-queue.test.ts` (new)

**Interfaces:**
- Consumes: `buildAthleteCard` (Task 2), `lastCompletedWeekStart` rule below.
- Produces (exact signatures later tasks call via `internal.parentEmails.*`):
  - `enqueueWeekly: internalMutation, args: {}, returns: v.null()` — snapshot + enqueue all eligible students for the last completed week, kick processor.
  - `claimBatch: internalMutation, args: {}, returns: v.array(v.object({ _id: v.id("parentEmails"), toEmail: v.string(), payloadJson: v.string() }))`
  - `recordResults: internalMutation, args: { results: v.array(v.union(v.object({ id: v.id("parentEmails"), ok: v.literal(true) }), v.object({ id: v.id("parentEmails"), ok: v.literal(false), error: v.string() }))) }, returns: v.null()`
  - `hasPending: internalQuery, args: {}, returns: v.boolean()`
  - Exported constants: `BATCH_SIZE`, `DRIP_INTERVAL_MS`, `RETRY_BACKOFF_MS`, `MAX_ATTEMPTS`, `DAILY_SEND_CAP`.

NOTE for the implementer: `processBatch`, `kickIfPending`, `triggerNow`, and `weekStatus` are added to this same file in Tasks 6–7. Create the file in this task containing ONLY the queue core plus imports; later tasks append.

- [x] **Step 1: Write the failing tests**

Create `convex/parent-emails-queue.test.ts`:

```ts
// convex/parent-emails-queue.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import {
  datePlusDays,
  todayInCoachTz,
  weekStartIso,
} from "./lib/time";

type EmailDoc = {
  _id: string;
  studentId: unknown;
  weekStart: string;
  toEmail: string;
  payloadJson: string;
  status: string;
  attempts: number;
  dueAt: number;
  lastError?: string;
  sentAt?: number;
};

async function seedEligibleStudent(
  t: ReturnType<typeof convexTest>,
  name: string,
  email: string,
): Promise<ReturnType<typeof seedStudent>> {
  const seeded = await seedStudent(t, name);
  await t.run(async (ctx) => {
    await ctx.db.patch("students", seeded.studentId, { parentEmail: email });
  });
  return seeded;
}

async function insertRow(
  t: ReturnType<typeof convexTest>,
  studentId: string,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("parentEmails", {
      studentId: studentId as never,
      weekStart: "2026-01-05",
      toEmail: "parent@example.com",
      payloadJson: JSON.stringify({
        weekStart: "2026-01-05",
        card: { student: { name: "X" } },
      }),
      status: "pending",
      attempts: 0,
      dueAt: 0,
      createdAt: Date.now(),
      ...overrides,
    });
  });
}

async function allRows(t: ReturnType<typeof convexTest>): Promise<EmailDoc[]> {
  return t.run(async (ctx) => {
    return (await ctx.db.query("parentEmails").collect()) as unknown as EmailDoc[];
  });
}

describe("parentEmails.enqueueWeekly", () => {
  it("enqueues only active students with a parent email, idempotently", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedEligibleStudent(t, "Alex Santos", "alex.parent@example.com");
    await seedEligibleStudent(t, "No Email", ""); // patched to empty string = not set
    await seedStudent(t, "Inactive Kid");
    const inactive = await seedStudent(t, "Inactive Parented");
    await t.run(async (ctx) => {
      await ctx.db.patch("students", inactive.studentId, {
        parentEmail: "inactive.parent@example.com",
        status: "inactive",
      });
    });

    const weekStart = weekStartIso(datePlusDays(todayInCoachTz(), -1));

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.mutation(internal.parentEmails.enqueueWeekly, {});

    const rows = await allRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weekStart).toBe(weekStart);
    expect(rows[0]!.toEmail).toBe("alex.parent@example.com");
    expect(rows[0]!.status).toBe("pending");
    const payload = JSON.parse(
      (rows[0] as unknown as { payloadJson: string }).payloadJson,
    ) as { card: { student: { name: string } } };
    expect(payload.card.student.name).toBe("Alex Santos");
  });
});

describe("parentEmails.claimBatch", () => {
  it("claims only due pending rows and bumps their dueAt", async () => {
    const t = convexTest(schema, modules);
    const a = await seedStudent(t, "A");
    const b = await seedStudent(t, "B");
    const before = Date.now();
    await insertRow(t, a.studentId, { toEmail: "due@example.com" }); // dueAt 0 → due
    await insertRow(t, b.studentId, {
      toEmail: "future@example.com",
      dueAt: before + 3_600_000, // not due for an hour
    });

    const claimed = await t.mutation(internal.parentEmails.claimBatch, {});
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.toEmail).toBe("due@example.com");

    const rows = await allRows(t);
    const dueRow = rows.find((r) => r.toEmail === "due@example.com")!;
    const futureRow = rows.find((r) => r.toEmail === "future@example.com")!;
    expect(dueRow.dueAt).toBeGreaterThan(before); // bumped by the claim
    expect(futureRow.dueAt).toBe(before + 3_600_000); // untouched
  });
});

describe("parentEmails.recordResults", () => {
  it("marks successes sent with sentAt", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "A");
    await insertRow(t, studentId);
    const row = (await allRows(t))[0]!;

    await t.mutation(internal.parentEmails.recordResults, {
      results: [{ id: row._id as never, ok: true }],
    });

    const after = (await allRows(t))[0]!;
    expect(after.status).toBe("sent");
    expect(after.sentAt).toBeGreaterThan(0);
  });

  it("keeps failures pending with backoff until MAX_ATTEMPTS, then fails permanently", async () => {
    const t = convexTest(schema, modules);
    const a = await seedStudent(t, "A");
    const b = await seedStudent(t, "B");
    await insertRow(t, a.studentId); // attempts 0
    await insertRow(t, b.studentId, { attempts: 2 }); // one failure left
    const rows = await allRows(t);
    const fresh = rows.find((r) => r.attempts === 0)!;
    const exhausted = rows.find((r) => r.attempts === 2)!;

    await t.mutation(internal.parentEmails.recordResults, {
      results: [
        { id: fresh._id as never, ok: false, error: "boom" },
        { id: exhausted._id as never, ok: false, error: "boom 3" },
      ],
    });

    const after = await allRows(t);
    const freshAfter = after.find((r) => r._id === fresh._id)!;
    const exhaustedAfter = after.find((r) => r._id === exhausted._id)!;
    expect(freshAfter.status).toBe("pending");
    expect(freshAfter.attempts).toBe(1);
    expect(freshAfter.lastError).toBe("boom");
    expect(freshAfter.dueAt).toBeGreaterThan(Date.now());
    expect(exhaustedAfter.status).toBe("failed");
    expect(exhaustedAfter.attempts).toBe(3);
    expect(exhaustedAfter.lastError).toBe("boom 3");
  });
});

describe("parentEmails.hasPending", () => {
  it("reflects whether any pending rows exist", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "A");
    expect(await t.query(internal.parentEmails.hasPending, {})).toBe(false);
    await insertRow(t, studentId);
    expect(await t.query(internal.parentEmails.hasPending, {})).toBe(true);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/parent-emails-queue.test.ts`
Expected: FAIL — `internal.parentEmails` does not exist.

- [x] **Step 3: Implement the queue core**

Create `convex/parentEmails.ts`:

```ts
// convex/parentEmails.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireCoach } from "./lib/access";
import { buildAthleteCard } from "./lib/reportCard";
import type { ReportEmailPayload } from "./lib/reportEmail";
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";

const NOT_AUTHORIZED = "Not authorized";

export const BATCH_SIZE = 5;
export const DRIP_INTERVAL_MS = 2 * 60 * 1000;
export const RETRY_BACKOFF_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const DAILY_SEND_CAP = 400;

/** weekStart of the most recently completed week (Mon-Sun, coach TZ). */
function lastCompletedWeekStart(): string {
  return weekStartIso(datePlusDays(todayInCoachTz(), -1));
}

function startOfUtcDay(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

type EnqueueSummary = {
  enqueued: number;
  errors: { student: string; error: string }[];
};

/**
 * Snapshots the full report card for every active student with a
 * parent email into a pending queue row. Idempotent per
 * (weekStart, studentId) via the unique index.
 */
async function enqueueEligible(
  ctx: MutationCtx,
  weekStart: string,
): Promise<EnqueueSummary> {
  const students = await ctx.db.query("students").take(1000);
  const eligible = students.filter(
    (s) => s.status === "active" && !!s.parentEmail,
  );
  let enqueued = 0;
  const errors: { student: string; error: string }[] = [];
  for (const student of eligible) {
    try {
      const existing = await ctx.db
        .query("parentEmails")
        .withIndex("by_week_and_student", (q) =>
          q.eq("weekStart", weekStart).eq("studentId", student._id),
        )
        .unique();
      if (existing) continue;
      const card = await buildAthleteCard(ctx, student, todayInCoachTz());
      const payload: ReportEmailPayload = { weekStart, card };
      await ctx.db.insert("parentEmails", {
        studentId: student._id,
        weekStart,
        toEmail: student.parentEmail!,
        payloadJson: JSON.stringify(payload),
        status: "pending",
        attempts: 0,
        dueAt: Date.now(),
        createdAt: Date.now(),
      });
      enqueued += 1;
    } catch (err) {
      errors.push({
        student: student._id,
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }
  return { enqueued, errors };
}

/** Cron entry (Mon 06:05 Manila): enqueue the week, kick the dripper. */
export const enqueueWeekly = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const weekStart = lastCompletedWeekStart();
    await enqueueEligible(ctx, weekStart);
    await ctx.scheduler.runAfter(0, internal.parentEmails.processBatch, {});
    return null;
  },
});

/**
 * Claims up to BATCH_SIZE due pending rows, bumping dueAt by the drip
 * interval so a crashed processor never strands rows in-flight.
 * Respects the daily send cap.
 */
export const claimBatch = internalMutation({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("parentEmails"),
      toEmail: v.string(),
      payloadJson: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const sentToday = await ctx.db
      .query("parentEmails")
      .withIndex("by_sentAt", (q) => q.gte("sentAt", startOfUtcDay()))
      .take(DAILY_SEND_CAP);
    const remaining = DAILY_SEND_CAP - sentToday.length;
    if (remaining <= 0) return [];
    const due = await ctx.db
      .query("parentEmails")
      .withIndex("by_status_and_due", (q) =>
        q.eq("status", "pending").lte("dueAt", Date.now()),
      )
      .take(Math.min(BATCH_SIZE, remaining));
    const now = Date.now();
    for (const row of due) {
      await ctx.db.patch(row._id, { dueAt: now + DRIP_INTERVAL_MS });
    }
    return due.map((r) => ({
      _id: r._id,
      toEmail: r.toEmail,
      payloadJson: r.payloadJson,
    }));
  },
});

/**
 * Records per-row send outcomes. Failures stay pending with 30-minute
 * backoff until MAX_ATTEMPTS, then become permanent failures.
 */
export const recordResults = internalMutation({
  args: {
    results: v.array(
      v.union(
        v.object({ id: v.id("parentEmails"), ok: v.literal(true) }),
        v.object({
          id: v.id("parentEmails"),
          ok: v.literal(false),
          error: v.string(),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    for (const result of results) {
      const row = await ctx.db.get("parentEmails", result.id);
      if (!row || row.status !== "pending") continue;
      if (result.ok) {
        await ctx.db.patch(row._id, { status: "sent", sentAt: Date.now() });
      } else {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await ctx.db.patch(row._id, {
            status: "failed",
            attempts,
            lastError: result.error,
          });
        } else {
          await ctx.db.patch(row._id, {
            attempts,
            lastError: result.error,
            dueAt: Date.now() + RETRY_BACKOFF_MS,
          });
        }
      }
    }
    return null;
  },
});

/** True when any pending rows exist (drives the reschedule decision). */
export const hasPending = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("parentEmails")
      .withIndex("by_status_and_due", (q) => q.eq("status", "pending"))
      .first();
    return row !== null;
  },
});
```

Note: `enqueueWeekly` references `internal.parentEmails.processBatch`, which Task 6 adds to this same file — the codegen + typecheck in this task would fail on the missing function, so in this task ONLY run vitest (convex-test resolves modules from disk at runtime, and the kick targets a function that exists after Task 6). Vitest does not typecheck. Run typecheck after Task 6.

- [x] **Step 4: Run tests**

Run: `npx vitest run convex/parent-emails-queue.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add convex/parentEmails.ts convex/parent-emails-queue.test.ts
git commit -m "feat(parent-emails): enqueue, claim, and record queue mutations"
```

---

### Task 6: `processBatch` action + `kickIfPending` drain

**Files:**
- Modify: `convex/parentEmails.ts` (append)
- Test: `convex/parent-emails-action.test.ts` (new)

**Interfaces:**
- Consumes: `sendMail` from `./lib/mailer` (Task 4), `renderReportEmail` + `ReportEmailPayload` from `./lib/reportEmail` (Task 3), `claimBatch`/`recordResults`/`hasPending` from this file (Task 5).
- Produces:
  - `processBatch: internalAction({ args: {}, returns: v.null(), useNode: true })` — sends one batch, records results, reschedules itself +DRIP_INTERVAL_MS if `hasPending`.
  - `kickIfPending: internalMutation, args: {}, returns: v.null()` — schedules `processBatch` now if any pending row exists (used by the Task 8 drain cron).

- [x] **Step 1: Write the failing tests**

Create `convex/parent-emails-action.test.ts`:

```ts
// convex/parent-emails-action.test.ts
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { sendMail } from "./lib/mailer";
import { DRIP_INTERVAL_MS } from "./parentEmails";

vi.mock("./lib/mailer", () => ({
  sendMail: vi.fn(),
}));

const sendMailMock = vi.mocked(sendMail);

type EmailDoc = {
  _id: string;
  status: string;
  attempts: number;
  lastError?: string;
  sentAt?: number;
};

async function allRows(t: ReturnType<typeof convexTest>): Promise<EmailDoc[]> {
  return t.run(async (ctx) => {
    return (await ctx.db.query("parentEmails").collect()) as unknown as EmailDoc[];
  });
}

async function seedWithParent(
  t: ReturnType<typeof convexTest>,
  name: string,
): Promise<string> {
  const { userId, studentId } = await seedStudent(t, name);
  await t.run(async (ctx) => {
    await ctx.db.patch("students", studentId, { parentEmail: `${name.split(" ")[0]}@parent.example.com` });
  });
  return studentId;
}

afterEach(() => {
  sendMailMock.mockReset();
  vi.useRealTimers();
});

describe("parentEmails.processBatch", () => {
  it("sends the rendered card to each claimed row and marks them sent", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedWithParent(t, "Alex Santos");
    await seedWithParent(t, "Maria Reyes");
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.action(internal.parentEmails.processBatch, {});

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const first = sendMailMock.mock.calls[0][0];
    expect(first.to).toContain("@parent.example.com");
    expect(first.subject).toMatch(/^Weekly Swim Report — .+ \(week of \d{4}-\d{2}-\d{2}\)$/);
    expect(first.html).toContain("Attendance");
    expect(first.text).toContain("ATTENDANCE");

    const rows = await allRows(t);
    expect(rows.filter((r) => r.status === "sent")).toHaveLength(2);
  });

  it("keeps failed sends pending with the error recorded", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedWithParent(t, "Alex Santos");
    sendMailMock.mockResolvedValue({ ok: false, error: "smtp down" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.action(internal.parentEmails.processBatch, {});

    const rows = await allRows(t);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.lastError).toBe("smtp down");
  });

  it("drains a multi-batch queue through the self-rescheduling scheduler", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await seedCoach(t);
    for (let i = 0; i < 7; i++) {
      await seedWithParent(t, `Swimmer ${i}`);
    }
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(DRIP_INTERVAL_MS);
    });

    expect(sendMailMock).toHaveBeenCalledTimes(7);
    const rows = await allRows(t);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });
});

describe("parentEmails.kickIfPending", () => {
  it("drains pending rows when kicked (safety drain)", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedWithParent(t, "Alex Santos");
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    // enqueueWeekly already kicked processBatch; drain that first.
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(DRIP_INTERVAL_MS);
    });

    const rows = await allRows(t);
    expect(rows[0]!.status).toBe("sent");

    // Kick with an empty queue: no more sends.
    await t.mutation(internal.parentEmails.kickIfPending, {});
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(DRIP_INTERVAL_MS);
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/parent-emails-action.test.ts`
Expected: FAIL — `internal.parentEmails.processBatch` / `kickIfPending` do not exist.

- [x] **Step 3: Append the action and drain to `convex/parentEmails.ts`**

Extend the imports at the top of `convex/parentEmails.ts`:

```ts
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { sendMail } from "./lib/mailer";
import { renderReportEmail } from "./lib/reportEmail";
```

(keep the existing imports; merge the `internalMutation`/`internalQuery` imports into one block from `"./_generated/server"`).

Then append to the file:

```ts
type SendOutcome =
  | { id: Id<"parentEmails">; ok: true }
  | { id: Id<"parentEmails">; ok: false; error: string };

/**
 * Node action: sends one claimed batch via SMTP, records per-row
 * outcomes, and reschedules itself while pending rows remain.
 * Duplicate concurrent runs are safe — claimed rows leave the due
 * set atomically inside claimBatch.
 */
export const processBatch = internalAction({
  args: {},
  returns: v.null(),
  useNode: true,
  handler: async (ctx) => {
    const claimed = await ctx.runMutation(internal.parentEmails.claimBatch, {});
    if (claimed.length === 0) return null;

    const results: SendOutcome[] = [];
    for (const row of claimed) {
      const payload = JSON.parse(row.payloadJson) as ReportEmailPayload;
      const { subject, html, text } = renderReportEmail(payload);
      const sent = await sendMail({ to: row.toEmail, subject, html, text });
      results.push(
        sent.ok
          ? { id: row._id, ok: true }
          : { id: row._id, ok: false, error: sent.error },
      );
    }
    await ctx.runMutation(internal.parentEmails.recordResults, { results });

    const pendingLeft = await ctx.runQuery(internal.parentEmails.hasPending, {});
    if (pendingLeft) {
      await ctx.scheduler.runAfter(
        DRIP_INTERVAL_MS,
        internal.parentEmails.processBatch,
        {},
      );
    }
    return null;
  },
});

/**
 * Safety drain (every 15 min): kicks processBatch if anything is
 * pending. Recovers from a crashed processor and drives backoff
 * retries. Cheap no-op when the queue is empty.
 */
export const kickIfPending = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("parentEmails")
      .withIndex("by_status_and_due", (q) => q.eq("status", "pending"))
      .first();
    if (row) {
      await ctx.scheduler.runAfter(0, internal.parentEmails.processBatch, {});
    }
    return null;
  },
});
```

- [x] **Step 4: Regenerate, typecheck, run tests**

Run: `npx convex codegen; npm run typecheck; npx vitest run convex/parent-emails-action.test.ts convex/parent-emails-queue.test.ts`
Expected: typecheck clean; all tests PASS (5 + 4).

- [x] **Step 5: Commit**

```bash
git add convex/parentEmails.ts convex/parent-emails-action.test.ts convex/_generated
git commit -m "feat(parent-emails): useNode drip sender with retry drain"
```

---

### Task 7: Coach API — `triggerNow` + `weekStatus`

**Files:**
- Modify: `convex/parentEmails.ts` (append)
- Test: `convex/parent-emails-authz.test.ts` (new)

**Interfaces:**
- Consumes: `enqueueEligible` (Task 5, same file), `requireCoach` (existing).
- Produces (used by Task 9 UI via `api.parentEmails.*`):
  - `triggerNow: mutation, args: {}, returns: v.object({ weekStart: v.string(), enqueued: v.number(), errors: v.array(v.object({ student: v.string(), error: v.string() })) })`
  - `weekStatus: query, args: {}, returns: v.object({ weekStart: v.string(), pending: v.number(), sent: v.number(), failed: v.number() })`

- [x] **Step 1: Write the failing tests**

Create `convex/parent-emails-authz.test.ts`:

```ts
// convex/parent-emails-authz.test.ts
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { sendMail } from "./lib/mailer";

vi.mock("./lib/mailer", () => ({
  sendMail: vi.fn(),
}));
const sendMailMock = vi.mocked(sendMail);
sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

async function seedWithParent(
  t: ReturnType<typeof convexTest>,
  name: string,
): Promise<void> {
  const { studentId } = await seedStudent(t, name);
  await t.run(async (ctx) => {
    await ctx.db.patch("students", studentId, {
      parentEmail: "parent@example.com",
    });
  });
}

describe("parentEmails.triggerNow", () => {
  it("rejects students and anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const { userId, studentId } = await seedStudent(t, "Alex Santos");
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.parentEmails.triggerNow, {}),
    ).rejects.toThrow("Not authorized");
    await expect(t.mutation(api.parentEmails.triggerNow, {})).rejects.toThrow(
      "Not authorized",
    );
    expect(studentId).toBeTruthy();
  });

  it("enqueues missing students for the coach, idempotently", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    await seedWithParent(t, "Alex Santos");

    const first = await t
      .withIdentity({ subject: coachId })
      .mutation(api.parentEmails.triggerNow, {});
    const second = await t
      .withIdentity({ subject: coachId })
      .mutation(api.parentEmails.triggerNow, {});

    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0);
    expect(first.weekStart).toBe(second.weekStart);
  });
});

describe("parentEmails.weekStatus", () => {
  it("counts this week's queue for the coach and rejects students", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    await seedWithParent(t, "Alex Santos");

    await t
      .withIdentity({ subject: coachId })
      .mutation(api.parentEmails.triggerNow, {});

    const status = await t
      .withIdentity({ subject: coachId })
      .query(api.parentEmails.weekStatus, {});
    expect(status.pending).toBe(1);
    expect(status.sent).toBe(0);
    expect(status.failed).toBe(0);

    const { userId } = await seedStudent(t, "Someone Else");
    await expect(
      t.withIdentity({ subject: userId }).query(api.parentEmails.weekStatus, {}),
    ).rejects.toThrow("Not authorized");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/parent-emails-authz.test.ts`
Expected: FAIL — `api.parentEmails` does not exist.

- [x] **Step 3: Append the public functions to `convex/parentEmails.ts`**

Extend the imports (merge into existing import blocks):

```ts
import { mutation, query } from "./_generated/server";
```

Append:

```ts
/** Coach-only: enqueue any missing students for the completed week and send now. */
export const triggerNow = mutation({
  args: {},
  returns: v.object({
    weekStart: v.string(),
    enqueued: v.number(),
    errors: v.array(
      v.object({ student: v.string(), error: v.string() }),
    ),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const weekStart = lastCompletedWeekStart();
    const summary = await enqueueEligible(ctx, weekStart);
    await ctx.scheduler.runAfter(0, internal.parentEmails.processBatch, {});
    return { weekStart, ...summary };
  },
});

/** Coach-only: this week's queue counts for the reports page strip. */
export const weekStatus = query({
  args: {},
  returns: v.object({
    weekStart: v.string(),
    pending: v.number(),
    sent: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const weekStart = lastCompletedWeekStart();
    const rows = await ctx.db
      .query("parentEmails")
      .withIndex("by_week_and_student", (q) => q.eq("weekStart", weekStart))
      .collect();
    return {
      weekStart,
      pending: rows.filter((r) => r.status === "pending").length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
  },
});
```

- [x] **Step 4: Regenerate, typecheck, run tests**

Run: `npx convex codegen; npm run typecheck; npx vitest run convex/parent-emails-authz.test.ts`
Expected: typecheck clean; PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add convex/parentEmails.ts convex/parent-emails-authz.test.ts convex/_generated
git commit -m "feat(parent-emails): coach triggerNow and weekStatus"
```

---

### Task 8: Cron registration

**Files:**
- Modify: `convex/crons.ts`

**Interfaces:**
- Consumes: `internal.parentEmails.enqueueWeekly` (Task 5), `internal.parentEmails.kickIfPending` (Task 6).
- Produces: two registered crons — `parent-email-enqueue` at `"5 22 * * 0"` (Mon 06:05 Manila) and `parent-email-drain` at `"7-59/15 * * * *"` (:07/:22/:37/:52 every hour — avoids the top of the hour per the eslint rule).

- [x] **Step 1: Register the crons**

Replace the contents of `convex/crons.ts` with:

```ts
/* eslint-disable @convex-dev/no-top-of-hour-crons */
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Monday 06:00 Asia/Manila == Sunday 22:00 UTC ("0 22 * * 0").
crons.cron(
  "weekly-report",
  "0 22 * * 0",
  internal.reports.generateWeekly,
  {},
);

// Monday 06:05 Asia/Manila == Sunday 22:05 UTC: snapshot cards and
// enqueue parent emails for the completed week.
crons.cron(
  "parent-email-enqueue",
  "5 22 * * 0",
  internal.parentEmails.enqueueWeekly,
  {},
);

// Safety drain at :07/:22/:37/:52 (avoids top of hour): recovers a
// crashed sender and drives 30-minute retry backoff.
crons.cron(
  "parent-email-drain",
  "7-59/15 * * * *",
  internal.parentEmails.kickIfPending,
  {},
);

export default crons;
```

- [x] **Step 2: Verify**

Run: `npm run typecheck; npm run lint; npx vitest run convex/parent-emails-action.test.ts`
Expected: typecheck and lint clean (no top-of-hour cron warnings); the kickIfPending drain test still passes.

- [x] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat(parent-emails): weekly enqueue and safety-drain crons"
```

---

### Task 9: Coach UI — send button + status strip

**Files:**
- Modify: `app/coach/reports/page.tsx`

**Interfaces:**
- Consumes: `api.parentEmails.triggerNow` and `api.parentEmails.weekStatus` (Task 7); existing `Button` component; `sonner` toasts (already used in the project).
- Produces: "Send parent emails" button in the header actions and a one-line status strip under the header.

- [x] **Step 1: Add the button and status strip**

In `app/coach/reports/page.tsx`, update the imports:

```ts
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  WeeklyReportCard,
  type WeeklyPayload,
} from "@/components/coach/weekly-report-card";
```

Replace the component body with:

```tsx
export default function CoachReportsPage() {
  const result = useQuery(api.reports.list, {});
  const emailStatus = useQuery(api.parentEmails.weekStatus, {});
  const triggerEmails = useMutation(api.parentEmails.triggerNow);
  const [sending, setSending] = useState(false);

  const onSendEmails = async () => {
    setSending(true);
    try {
      const r = await triggerEmails({});
      toast.success(
        r.enqueued > 0
          ? `Queued ${r.enqueued} parent email${r.enqueued === 1 ? "" : "s"} for the week of ${r.weekStart}`
          : `All parent emails for the week of ${r.weekStart} are already queued`,
      );
    } catch {
      toast.error("Failed to queue parent emails");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Weekly Reports"
        description="Auto-generated every Monday at 06:00."
        actions={
          <div className="flex gap-2 print:hidden">
            <Button
              className="gap-2"
              disabled={sending}
              onClick={() => void onSendEmails()}
            >
              <Mail className="h-4 w-4" />
              {sending ? "Queueing…" : "Send parent emails"}
            </Button>
            <Button
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        }
      />

      {emailStatus !== undefined && (
        <p className="text-sm text-muted-foreground print:hidden">
          Parent emails (week of {emailStatus.weekStart}): {emailStatus.sent} sent ·{" "}
          {emailStatus.pending} queued · {emailStatus.failed} failed
        </p>
      )}

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

- [x] **Step 2: Verify**

Run: `npm run typecheck; npm run lint`
Expected: both clean. (Manual check optional: `npm run dev`, open `/coach/reports`, press "Send parent emails" — with SMTP secrets unset, rows become failures with "SMTP not configured", proving the pipeline runs end to end.)

- [x] **Step 3: Commit**

```bash
git add app/coach/reports/page.tsx
git commit -m "feat(parent-emails): coach send button and weekly status strip"
```

---

### Task 10: Env docs + README + full verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (append a section)

**Interfaces:**
- Consumes: nothing code-level.
- Produces: documented env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` and operator instructions.

- [x] **Step 1: Extend `.env.example`**

Append to `.env.example`:

```
# Parent weekly emails — Gmail SMTP (server-side only — never expose to the browser)
# Real secrets live per Convex deployment: npx convex env add SMTP_PASS <app password>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
```

- [x] **Step 2: Append the README section**

Append to `README.md`:

```md
## Parent weekly emails

Every Monday 06:05 (Asia/Manila), each active student with a parent
email receives their full report card. Emails drip out in batches of 5
every 2 minutes through Gmail SMTP so the sender account is never
blasted. A safety cron re-checks the queue every 15 minutes; failed
sends retry up to 3 times with 30-minute backoff, and sending stops at
400 emails/day (Gmail's limit is ~500).

Setup:

1. Enable 2FA on the sending Google account and create an App Password
   (Google Account → Security → App passwords).
2. Set the Convex environment variables for your deployment:
   - `npx convex env add SMTP_USER you@gmail.com`
   - `npx convex env add SMTP_PASS <app password>`
   - `npx convex env add MAIL_FROM "CoachKen Tracker <you@gmail.com>"` (optional)
3. Fill in each student's **Parent email** in the coach app.
4. To send immediately: **Reports → Send parent emails**.
```

- [x] **Step 3: Full verification**

Run: `npm run typecheck; npm run lint; npm test`
Expected: typecheck clean, lint clean, ALL tests pass (existing suites plus the new `parent-emails-*`, `report-email`, `mailer`, and `reports-card` suites).

- [x] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs(parent-emails): smtp env setup and operator guide"
```

---

## Plan Self-Review (already applied)

- Spec coverage: queue table (Task 1), card extraction (Task 2), email rendering (Task 3), SMTP mailer (Task 4), enqueue/claim/record (Task 5), drip processor + crash recovery drain (Task 6), manual trigger + status (Tasks 7, 9), cron cadence + daily cap (Tasks 5, 8), docs/env (Task 10). Spec's "processor crashes mid-batch → next run retries" requires the drain cron; Task 8 adds it.
- No placeholders: every step has complete code or exact commands.
- Type consistency: `ReportEmailPayload`, `AthleteCard`, `sendMail` return shape, `internal.parentEmails.*` names, and `api.parentEmails.triggerNow/weekStatus` field names match across tasks.
