# Phase 1: Groups, Profiles, Practices, Bulk Roll Call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the coach roadmap (spec: `docs/superpowers/specs/2026-08-28-coach-features-roadmap-design.md`): training groups, swimmer profiles, practice plans with one-click fan-out to completed sessions, and bulk roll call.

**Architecture:** All writes stay coach-only and are enforced in Convex functions via `convex/lib/access.ts` (`requireCoach`). New tables (`groups`, `practices`) follow existing conventions: `updatedAt` timestamp, `YYYY-MM-DD` date strings, indexed access paths, bounded `take()` reads. One planned practice fans out per-student `trainingSessions` rows inside a single idempotent mutation. Test infra (vitest + convex-test) lands in Task 1; every backend task is TDD.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind + shadcn/ui (existing components only), Convex ^1.44, Convex Auth, vitest + convex-test + @edge-runtime/vm (new dev dependencies).

## Global Constraints

- Dates are `"YYYY-MM-DD"` strings; months `"YYYY-MM"` (`assertDateString` / `assertMonthString` in `convex/lib/validation.ts`).
- Attendance domain rule: `present` + `late` = attended, `absent` does not count.
- All authorization happens in Convex functions via `requireCoach` / `requireStudent` / `resolveStudentAccess` (`convex/lib/access.ts`). Never trust client-provided identity.
- Every Convex function declares `args` validators; errors are `new ConvexError("<user-readable message>")`; queries return bounded collections (`.take(n)`), never `.collect()`.
- Never read the wall clock inside queries (`Date.now()` only in mutations/actions). Pass "today" from the client as an argument.
- New schema fields are optional — no destructive migration, no backfill in Phase 1.
- `medicalNotes` on students is coach-only: it must never appear in a student-facing query result.
- Existing behavior stays intact: legacy attendance % keeps its record-based derivation; goals auto-complete at 100% unchanged.
- Gates for every task: `npm run typecheck`, `npm run lint`, and `npm test` all pass.
- Commit style: conventional commits (`feat:`, `test:`, `docs:`) matching `git log --oneline`.
- Convex guidelines: `convex/_generated/ai/guidelines.md` (key rules summarized above).

---

### Task 1: Test infrastructure (vitest + convex-test)

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Create: `convex/test.setup.ts`
- Create: `convex/tests/helpers.ts`
- Create: `convex/smoke.test.ts`

**Interfaces:**
- Consumes: `api.students.list` (existing coach-only query) to prove the identity pattern.
- Produces: `npm test` script; `modules` export from `convex/test.setup.ts`; helpers `seedCoach(t)`, `seedStudent(t, name)` from `convex/tests/helpers.ts` used by every later backend test task.

- [ ] **Step 1: Read the Convex guidelines**

Read `convex/_generated/ai/guidelines.md` — the Testing guidelines section is the basis for this task.

- [ ] **Step 2: Install test dependencies**

```bash
npm install --save-dev convex-test vitest @edge-runtime/vm
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 3: Add npm scripts**

In `package.json`, replace the `scripts` block with:

```json
"scripts": {
  "dev": "convex dev --start \"next dev\"",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "build": "npm run typecheck && next build",
  "start": "next start",
  "lint": "eslint . --ignore-pattern \"convex/_generated/**\""
},
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
  },
});
```

- [ ] **Step 5: Create the shared module map**

Create `convex/test.setup.ts`:

```ts
/// <reference types="vite/client" />

export const modules = import.meta.glob("./**/*.ts");
```

- [ ] **Step 6: Create identity helpers**

Auth background (verified against the installed `@convex-dev/auth` in `node_modules/@convex-dev/auth/dist/server/implementation/index.js`): `getAuthUserId(ctx)` returns `identity.subject.split("|")[0]` — so a test identity whose `subject` is a `users` table id resolves to that user. Create `convex/tests/helpers.ts`:

```ts
import type { convexTest } from "convex-test";

type T = ReturnType<typeof convexTest>;

export async function seedCoach(t: T): Promise<string> {
  return t.run(async (ctx) => {
    return ctx.db.insert("users", { name: "Coach Ken", role: "coach" });
  });
}

export async function seedStudent(
  t: T,
  name: string,
): Promise<{ userId: string; studentId: string }> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name, role: "student" });
    const studentId = await ctx.db.insert("students", {
      userId,
      status: "active",
      updatedAt: Date.now(),
    });
    return { userId, studentId };
  });
}
```

- [ ] **Step 7: Write the smoke test**

Create `convex/smoke.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

test("coach identity passes requireCoach and sees students", async () => {
  const t = convexTest(schema, modules);
  await seedStudent(t, "Alex Santos");
  const coachId = await seedCoach(t);
  const students = await t
    .withIdentity({ subject: coachId })
    .query(api.students.list, { search: "alex" });
  expect(students).toHaveLength(1);
  expect(students[0]).toMatchObject({ name: "Alex Santos" });
});

test("student identity is rejected by coach-only queries", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedStudent(t, "Maria Reyes");
  await expect(
    t.withIdentity({ subject: userId }).query(api.students.list, {}),
  ).rejects.toThrowError("Not authorized");
});

test("anonymous callers are rejected by coach-only queries", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.students.list, {})).rejects.toThrowError(
    "Not authorized",
  );
});
```

- [ ] **Step 8: Run the tests**

```bash
npm test
```

Expected: `3 passed`. If the `ReturnType<typeof convexTest>` type in helpers fails typecheck, inspect `node_modules/convex-test` for the exported instance type and use it instead.

- [ ] **Step 9: Verify gates**

```bash
npm run typecheck
npm run lint
```

Expected: both exit cleanly.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts convex/test.setup.ts convex/tests/helpers.ts convex/smoke.test.ts
git commit -m "test: add vitest + convex-test infrastructure with auth smoke tests"
```

---

### Task 2: M1 backend — groups table, groups.ts, students.list group support

**Files:**
- Modify: `convex/schema.ts` (add `groups` table; add `groupId` to `students` + `by_group` index)
- Modify: `convex/lib/validation.ts` (add `normalizeGroupName`)
- Create: `convex/groups.ts`
- Modify: `convex/students.ts` (`list` gains `groupId` filter + group fields in summary)
- Create: `convex/groups.test.ts`

**Interfaces:**
- Consumes: `requireCoach` from `./lib/access`.
- Produces (all coach-only):
  - `api.groups.list` → `[{ groupId, name, description: string | null, status: "active" | "archived", memberCount: number }]`
  - `api.groups.create` args `{ name: string, description?: string }` → `{ groupId }`
  - `api.groups.rename` args `{ groupId, name?, description? }`
  - `api.groups.setStatus` args `{ groupId, status: "active" | "archived" }`
  - `api.groups.assignStudent` args `{ studentId: Id<"students">, groupId: Id<"groups"> | null }`
  - `api.students.list` args gain `groupId?: Id<"groups"> | null` (undefined = all, null = unassigned only); rows gain `groupId: Id<"groups"> | null` and `groupName: string | null`.

- [ ] **Step 1: Write failing tests**

Create `convex/groups.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

test("coach creates a group and sees it listed with member count", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
    description: "Race squad",
  });
  const { studentId } = await seedStudent(t, "Alex Santos");
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId });

  const groups = await asCoach.query(api.groups.list, {});
  expect(groups).toMatchObject([
    { name: "Competitive", description: "Race squad", status: "active", memberCount: 1 },
  ]);
});

test("duplicate active group names are rejected (case-insensitive)", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  await asCoach.mutation(api.groups.create, { name: "Juniors" });
  await expect(
    asCoach.mutation(api.groups.create, { name: "juniors" }),
  ).rejects.toThrowError("An active group with this name already exists");
});

test("archived group names can be reused; archived groups keep members", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, { name: "Juniors" });
  const { studentId } = await seedStudent(t, "Daniel Cruz");
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId });
  await asCoach.mutation(api.groups.setStatus, { groupId, status: "archived" });

  const again = await asCoach.mutation(api.groups.create, { name: "Juniors" });
  expect(again.groupId).toBeTruthy();

  const groups = await asCoach.query(api.groups.list, {});
  const archived = groups.find((g) => g.status === "archived");
  expect(archived).toMatchObject({ name: "Juniors", memberCount: 1 });
});

test("assignStudent rejects unknown group and clears with null", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, { name: "Development" });
  const { studentId } = await seedStudent(t, "Maria Reyes");
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId });
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId: null });

  const students = await asCoach.query(api.students.list, { groupId: null });
  expect(students).toMatchObject([{ name: "Maria Reyes", groupName: null }]);
});

test("students.list filters by group and exposes groupName", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, { name: "Competitive" });
  const alex = await seedStudent(t, "Alex Santos");
  await seedStudent(t, "Maria Reyes");
  await asCoach.mutation(api.groups.assignStudent, {
    studentId: alex.studentId,
    groupId,
  });

  const inGroup = await asCoach.query(api.students.list, { groupId });
  expect(inGroup.map((s) => s.name)).toEqual(["Alex Santos"]);
  expect(inGroup[0]).toMatchObject({ groupName: "Competitive" });

  const unassigned = await asCoach.query(api.students.list, { groupId: null });
  expect(unassigned.map((s) => s.name)).toEqual(["Maria Reyes"]);
});

test("students cannot create groups", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedStudent(t, "Alex Santos");
  await expect(
    t.withIdentity({ subject: userId }).mutation(api.groups.create, { name: "Hax" }),
  ).rejects.toThrowError("Not authorized");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `api.groups` does not exist (type error) and `students.list` rejects `groupId`.

- [ ] **Step 3: Update the schema**

In `convex/schema.ts`, add the `groups` table (after `users`) and replace the `students` table definition:

```ts
  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"]),
  students: defineTable({
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_group", ["groupId"]),
```

(Leave the rest of `schema.ts` unchanged.)

- [ ] **Step 4: Add group-name validation**

Append to `convex/lib/validation.ts`:

```ts
export function normalizeGroupName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > 80) {
    throw new ConvexError("Group name must be between 1 and 80 characters");
  }
  return name;
}
```

- [ ] **Step 5: Create convex/groups.ts**

```ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { normalizeGroupName } from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const groupStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

const groupRecord = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  status: groupStatusValidator,
  memberCount: v.number(),
});

type Ctx = Parameters<typeof requireCoach>[0];

async function assertNameFree(
  ctx: Ctx,
  name: string,
  exceptGroupId?: string,
): Promise<void> {
  const groups = await ctx.db
    .query("groups")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(500);
  const taken = groups.some(
    (g) =>
      g.name.toLowerCase() === name.toLowerCase() && g._id !== exceptGroupId,
  );
  if (taken) {
    throw new ConvexError("An active group with this name already exists");
  }
}

/**
 * Coach-only: all groups with member counts, active groups first.
 */
export const list = query({
  args: {},
  returns: v.array(groupRecord),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const groups = await ctx.db.query("groups").withIndex("by_status").take(500);
    const rows = await Promise.all(
      groups.map(async (group) => ({
        groupId: group._id,
        name: group.name,
        description: group.description ?? null,
        status: group.status,
        memberCount: (
          await ctx.db
            .query("students")
            .withIndex("by_group", (q) => q.eq("groupId", group._id))
            .take(500)
        ).length,
      })),
    );
    const rank = (s: string) => (s === "active" ? 0 : 1);
    return rows.sort(
      (a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name),
    );
  },
});

/**
 * Coach-only: create a group. Names are unique among active groups.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.object({ groupId: v.id("groups") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const name = normalizeGroupName(args.name);
    await assertNameFree(ctx, name);
    const description = args.description?.trim();
    const groupId = await ctx.db.insert("groups", {
      name,
      ...(description ? { description } : {}),
      status: "active",
      updatedAt: Date.now(),
    });
    return { groupId };
  },
});

/**
 * Coach-only: rename a group / edit its description.
 */
export const rename = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError("Group not found");
    const patch: { name?: string; description?: string; updatedAt: number } = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      patch.name = normalizeGroupName(args.name);
      if (group.status === "active") {
        await assertNameFree(ctx, patch.name, group._id);
      }
    }
    if (args.description !== undefined) {
      const description = args.description.trim();
      if (description) patch.description = description;
    }
    await ctx.db.patch("groups", args.groupId, patch);
    return null;
  },
});

/**
 * Coach-only: archive or reactivate a group. Groups are never deleted
 * (history stays linkable). Archiving keeps memberships.
 */
export const setStatus = mutation({
  args: { groupId: v.id("groups"), status: groupStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError("Group not found");
    await ctx.db.patch("groups", args.groupId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: assign a student to an active group, or clear their
 * group by passing null.
 */
export const assignStudent = mutation({
  args: {
    studentId: v.id("students"),
    groupId: v.union(v.id("groups"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");
    if (args.groupId !== null) {
      const group = await ctx.db.get("groups", args.groupId);
      if (!group || group.status !== "active") {
        throw new ConvexError("Group not found");
      }
    }
    await ctx.db.patch("students", args.studentId, {
      groupId: args.groupId === null ? undefined : args.groupId,
      updatedAt: Date.now(),
    });
    return null;
  },
});
```

- [ ] **Step 6: Extend students.list**

In `convex/students.ts`, replace `studentSummary`:

```ts
const studentSummary = v.object({
  studentId: v.id("students"),
  userId: v.id("users"),
  name: v.string(),
  email: v.string(),
  image: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("inactive")),
  groupId: v.union(v.id("groups"), v.null()),
  groupName: v.union(v.string(), v.null()),
  attendancePercentage: v.union(v.number(), v.null()),
  overallProgress: v.union(v.number(), v.null()),
  currentGoalTitle: v.union(v.string(), v.null()),
});
```

and replace the `list` function:

```ts
export const list = query({
  args: {
    search: v.optional(v.string()),
    groupId: v.optional(v.union(v.id("groups"), v.null())),
  },
  returns: v.array(studentSummary),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_status")
      .take(500);
    const groupNameById = new Map(groups.map((g) => [g._id, g.name]));

    const search = args.search?.trim().toLowerCase() ?? "";
    const students = await ctx.db.query("students").take(500);
    const rows = await Promise.all(
      students.map(async (student) => {
        if (args.groupId !== undefined) {
          if (args.groupId === null) {
            if (student.groupId !== undefined) return null;
          } else if (student.groupId !== args.groupId) {
            return null;
          }
        }
        const user = await ctx.db.get("users", student.userId);
        if (!user) return null;
        const name = user.name ?? "";
        const email = user.email ?? "";
        if (
          search !== "" &&
          !name.toLowerCase().includes(search) &&
          !email.toLowerCase().includes(search)
        ) {
          return null;
        }
        const [attendance, progress, goal] = await Promise.all([
          attendanceStats(ctx, student._id),
          overallProgress(ctx, student._id),
          ctx.db
            .query("trainingGoals")
            .withIndex("by_student_and_updated", (q) =>
              q.eq("studentId", student._id),
            )
            .order("desc")
            .take(1),
        ]);
        return {
          studentId: student._id,
          userId: user._id,
          name,
          email,
          image: user.image ?? null,
          status: student.status,
          groupId: student.groupId ?? null,
          groupName: student.groupId
            ? (groupNameById.get(student.groupId) ?? null)
            : null,
          attendancePercentage: attendance.percentage,
          overallProgress: progress,
          currentGoalTitle: goal[0]?.title ?? null,
        };
      }),
    );
    return rows.filter((row) => row !== null).sort((a, b) => a.name.localeCompare(b.name));
  },
});
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test
```

Expected: groups tests + smoke tests PASS.

- [ ] **Step 8: Verify gates**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add convex/schema.ts convex/lib/validation.ts convex/groups.ts convex/students.ts convex/groups.test.ts
git commit -m "feat: training groups with member counts and student group filters"
```

---

### Task 3: M1 UI — groups page, nav, group assignment, students table column

**Files:**
- Create: `app/coach/groups/page.tsx`
- Create: `components/coach/group-form-dialog.tsx`
- Modify: `components/layout/app-shell.tsx` (add `UsersRound` icon)
- Modify: `app/coach/layout.tsx` (nav item)
- Modify: `components/coach/edit-student-dialog.tsx` (group select)
- Modify: `app/coach/students/page.tsx` (group filter + column)
- Modify: `app/coach/students/[id]/page.tsx` (pass `groupId: null` placeholder)

**Interfaces:**
- Consumes: `api.groups.list/create/rename/setStatus/assignStudent` (Task 2); `api.students.list` with `groupId` arg.
- Produces: route `/coach/groups`; `GroupFormDialog` with props `{ mode: "create" } | { mode: "edit"; group: { groupId: string; name: string; description: string | null } }`.

- [ ] **Step 1: Add the nav icon**

In `components/layout/app-shell.tsx`: add `UsersRound` to the lucide-react import list, add `"UsersRound"` to the `NavIconName` union, and add `UsersRound,` to `iconMap`.

- [ ] **Step 2: Add nav item**

In `app/coach/layout.tsx`, insert after the Students item:

```ts
  { href: "/coach/groups", label: "Groups", icon: "UsersRound" },
```

- [ ] **Step 3: Create the group form dialog**

Create `components/coach/group-form-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/lib/format";

const groupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(500),
});

export function GroupFormDialog({
  mode,
  group,
}: {
  mode: "create" | "edit";
  group?: { groupId: string; name: string; description: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const create = useMutation(api.groups.create);
  const rename = useMutation(api.groups.rename);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsed = groupSchema.safeParse({ name, description });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (mode === "create") {
        await create({
          name: parsed.data.name,
          ...(parsed.data.description
            ? { description: parsed.data.description }
            : {}),
        });
        toast.success("Group created.");
      } else {
        await rename({
          groupId: group!.groupId as never,
          name: parsed.data.name,
          ...(parsed.data.description
            ? { description: parsed.data.description }
            : {}),
        });
        toast.success("Group updated.");
      }
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      setError(errorMessage(err, "Unable to save the group. Please try again."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            Create Group
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={submitting}>
            Rename
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Group" : "Rename Group"}
          </DialogTitle>
          <DialogDescription>
            Training groups let you plan practices and take roll call per squad.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-description">Description (optional)</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : mode === "create"
                  ? "Create Group"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the groups page**

Create `app/coach/groups/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, UsersRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { GroupFormDialog } from "@/components/coach/group-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/format";

export default function CoachGroupsPage() {
  const groups = useQuery(api.groups.list, {});
  const setStatus = useMutation(api.groups.setStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleArchive(groupId: string, next: "active" | "archived") {
    if (busyId !== null) return;
    setError(null);
    setBusyId(groupId);
    try {
      await setStatus({ groupId: groupId as never, status: next });
      toast.success(
        next === "archived" ? "Group archived." : "Group reactivated.",
      );
      setBusyId(null);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to update the group. Please try again."),
      );
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Training groups for planning practices and roll call."
        actions={<GroupFormDialog mode="create" />}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent>
          {groups === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No groups yet"
              description="Create your first training group, e.g. Development or Competitive."
            />
          ) : (
            <ul className="divide-y">
              {groups.map((group) => (
                <li
                  key={group.groupId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{group.name}</span>
                      {group.status === "archived" ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : null}
                    </div>
                    {group.description ? (
                      <p className="max-w-xl truncate text-sm text-muted-foreground">
                        {group.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                    </span>
                    {group.status === "active" ? (
                      <GroupFormDialog
                        mode="edit"
                        group={{
                          groupId: group.groupId,
                          name: group.name,
                          description: group.description,
                        }}
                      />
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId !== null}
                      onClick={() =>
                        void toggleArchive(
                          group.groupId,
                          group.status === "active" ? "archived" : "active",
                        )
                      }
                    >
                      {group.status === "active" ? (
                        <>
                          <Archive className="size-4" aria-hidden="true" />
                          Archive
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="size-4" aria-hidden="true" />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>
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

- [ ] **Step 5: Add group select to the edit-student dialog**

In `components/coach/edit-student-dialog.tsx`:

1. Add to the existing convex/react import: `useQuery`.
2. Change the props type and add state + queries (keep existing state):

```tsx
export function EditStudentDialog({
  studentId,
  initial,
}: {
  studentId: string;
  initial: { name: string; status: "active" | "inactive"; image: string; groupId: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<"active" | "inactive">(initial.status);
  const [image, setImage] = useState(initial.image);
  const [groupId, setGroupId] = useState<string>(initial.groupId ?? "unassigned");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const update = useMutation(api.students.update);
  const assignStudent = useMutation(api.groups.assignStudent);
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
```

3. In `handleSubmit`, after the existing `await update({...})` add:

```tsx
      if (groupId !== (initial.groupId ?? "unassigned")) {
        await assignStudent({
          studentId: studentId as never,
          groupId: groupId === "unassigned" ? null : (groupId as never),
        });
      }
```

4. Add this select between the Avatar URL field and the Status field:

```tsx
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-group">Training group</Label>
            <Select
              value={groupId}
              onValueChange={setGroupId}
              disabled={submitting || groups === undefined}
            >
              <SelectTrigger id="edit-group" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {activeGroups.map((group) => (
                  <SelectItem key={group.groupId} value={group.groupId}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 6: Add group filter + column to the students page**

In `app/coach/students/page.tsx`:

1. Add imports:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

2. Replace the search state + query lines:

```tsx
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
  const students = useQuery(api.students.list, {
    search,
    groupId:
      groupFilter === "all"
        ? undefined
        : groupFilter === "unassigned"
          ? null
          : (groupFilter as never),
  });
```

3. After the search input's wrapping `div`, add:

```tsx
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full max-w-44" aria-label="Filter by group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {activeGroups.map((group) => (
                <SelectItem key={group.groupId} value={group.groupId}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
```

4. Add a header cell after the Status `<TableHead>`:

```tsx
                    <TableHead className="hidden md:table-cell">Group</TableHead>
```

and a matching cell after the Status `<TableCell>`:

```tsx
                      <TableCell className="hidden md:table-cell">
                        {student.groupName === null ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <span className="text-sm">{student.groupName}</span>
                        )}
                      </TableCell>
```

- [ ] **Step 7: Keep the detail page compiling**

In `app/coach/students/[id]/page.tsx`, add `groupId: null` to the `EditStudentDialog` `initial` prop (Task 5 replaces it with the real value):

```tsx
            <EditStudentDialog
              studentId={student.studentId}
              initial={{
                name: student.name,
                status: student.status,
                image: student.image ?? "",
                groupId: null,
              }}
            />
```

- [ ] **Step 8: Verify gates**

```bash
npm run typecheck
npm run lint
npm test
```

- [ ] **Step 9: Manual smoke test**

With `npx convex dev` running: coach creates/renames/archives groups; students table shows Group column + filter; Edit Profile assigns a group.

- [ ] **Step 10: Commit**

```bash
git add app/coach/groups/page.tsx components/coach/group-form-dialog.tsx components/layout/app-shell.tsx app/coach/layout.tsx components/coach/edit-student-dialog.tsx app/coach/students/page.tsx "app/coach/students/[id]/page.tsx"
git commit -m "feat: groups management UI with student assignment and filters"
```

---

### Task 4: M2 backend — swimmer profile fields

**Files:**
- Modify: `convex/schema.ts` (profile fields on `students`)
- Modify: `convex/lib/validation.ts` (add `assertDateOfBirth`)
- Modify: `convex/students.ts` (`create`, `createProfile`, `update`, `get`, `myProfile`)
- Create: `convex/profiles.test.ts`

**Interfaces:**
- Consumes: Task 2 schema (`groupId`, groups table).
- Produces:
  - `students` documents may carry: `dateOfBirth?: string`, `sex?: "M" | "F"`, `parentName?: string`, `parentPhone?: string`, `parentEmail?: string`, `joinedAt?: string`, `medicalNotes?: string`.
  - `api.students.create` and `api.students.update` accept these as optional args (`update` also accepts `groupId: Id<"groups"> | null`).
  - `api.students.get` (coach) returns all profile fields + `medicalNotes` + `groupId`/`groupName`.
  - `api.students.myProfile` (student) returns profile fields WITHOUT `medicalNotes`.

- [ ] **Step 1: Write failing tests**

Create `convex/profiles.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

const DOB = "2011-05-14";

test("coach updates a full swimmer profile and reads it back", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { studentId } = await seedStudent(t, "Alex Santos");
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });

  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    dateOfBirth: DOB,
    sex: "M",
    parentName: "Ana Santos",
    parentPhone: "+1 555 0100",
    parentEmail: "ana@example.com",
    joinedAt: "2026-01-15",
    medicalNotes: "Mild asthma; carries inhaler.",
    groupId,
  });

  const detail = await asCoach.query(api.students.get, {
    studentId: studentId as never,
  });
  expect(detail).toMatchObject({
    dateOfBirth: DOB,
    sex: "M",
    parentName: "Ana Santos",
    parentEmail: "ana@example.com",
    medicalNotes: "Mild asthma; carries inhaler.",
    groupName: "Competitive",
  });
});

test("date of birth in the future is rejected", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { studentId } = await seedStudent(t, "Maria Reyes");
  await expect(
    asCoach.mutation(api.students.update, {
      studentId: studentId as never,
      dateOfBirth: "2030-01-01",
    }),
  ).rejects.toThrowError("Date of birth must be at least 3 years in the past");
});

test("myProfile never exposes medical notes", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { userId, studentId } = await seedStudent(t, "Daniel Cruz");
  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    dateOfBirth: DOB,
    medicalNotes: "Private coach note",
  });

  const profile = await t
    .withIdentity({ subject: userId })
    .query(api.students.myProfile, {});
  expect(profile).toMatchObject({ dateOfBirth: DOB });
  expect(JSON.stringify(profile)).not.toContain("medicalNotes");
  expect(JSON.stringify(profile)).not.toContain("Private coach note");
});

test("update with groupId null clears the group", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Development",
  });
  const { studentId } = await seedStudent(t, "Daniel Cruz");
  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    groupId,
  });
  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    groupId: null,
  });
  const students = await asCoach.query(api.students.list, { groupId: null });
  expect(students.map((s) => s.name)).toContain("Daniel Cruz");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — unknown args / missing return fields.

- [ ] **Step 3: Add schema fields**

In `convex/schema.ts`, replace the `students` table definition (extends Task 2's version):

```ts
  students: defineTable({
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    dateOfBirth: v.optional(v.string()),
    sex: v.optional(v.union(v.literal("M"), v.literal("F"))),
    parentName: v.optional(v.string()),
    parentPhone: v.optional(v.string()),
    parentEmail: v.optional(v.string()),
    joinedAt: v.optional(v.string()),
    medicalNotes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_group", ["groupId"]),
```

- [ ] **Step 4: Add DOB validation**

Append to `convex/lib/validation.ts`:

```ts
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Date of birth must be a real calendar date between 3 and 100 years
 * in the past. Uses the wall clock — call from mutations only.
 */
export function assertDateOfBirth(value: string): void {
  assertDateString(value);
  const ms = Date.parse(`${value}T00:00:00Z`);
  const ageMs = Date.now() - ms;
  if (ageMs < 3 * YEAR_MS) {
    throw new ConvexError("Date of birth must be at least 3 years in the past");
  }
  if (ageMs > 100 * YEAR_MS) {
    throw new ConvexError("Date of birth must be within the last 100 years");
  }
}
```

- [ ] **Step 5: Extend students.ts**

In `convex/students.ts`:

1. Update the validation import:

```ts
import {
  assertDateOfBirth,
  assertDateString,
  assertPassword,
  normalizeEmail,
  normalizeName,
} from "./lib/validation";
```

2. Add shared arg validators + normalizer directly after `studentSummary` (before all functions that use them):

```ts
const profileFieldsArgs = {
  dateOfBirth: v.optional(v.string()),
  sex: v.optional(v.union(v.literal("M"), v.literal("F"))),
  parentName: v.optional(v.string()),
  parentPhone: v.optional(v.string()),
  parentEmail: v.optional(v.string()),
  joinedAt: v.optional(v.string()),
  medicalNotes: v.optional(v.string()),
};

type ProfilePatch = {
  dateOfBirth?: string;
  sex?: "M" | "F";
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  joinedAt?: string;
  medicalNotes?: string;
};

function validateProfileFields(args: {
  dateOfBirth?: string;
  sex?: "M" | "F";
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  joinedAt?: string;
  medicalNotes?: string;
}): ProfilePatch {
  const fields: ProfilePatch = {};
  if (args.dateOfBirth !== undefined) {
    assertDateOfBirth(args.dateOfBirth);
    fields.dateOfBirth = args.dateOfBirth;
  }
  if (args.sex !== undefined) fields.sex = args.sex;
  if (args.parentName !== undefined) {
    const value = args.parentName.trim();
    if (value.length > 100) {
      throw new ConvexError("Parent name must be at most 100 characters");
    }
    if (value) fields.parentName = value;
  }
  if (args.parentPhone !== undefined) {
    const value = args.parentPhone.trim();
    if (value.length > 30) {
      throw new ConvexError("Parent phone must be at most 30 characters");
    }
    if (value) fields.parentPhone = value;
  }
  if (args.parentEmail !== undefined) {
    const value = args.parentEmail.trim();
    if (value) fields.parentEmail = normalizeEmail(value);
  }
  if (args.joinedAt !== undefined) {
    assertDateString(args.joinedAt);
    fields.joinedAt = args.joinedAt;
  }
  if (args.medicalNotes !== undefined) {
    const value = args.medicalNotes.trim();
    if (value.length > 2000) {
      throw new ConvexError("Medical notes must be at most 2000 characters");
    }
    if (value) fields.medicalNotes = value;
  }
  return fields;
}
```

3. Replace `update`:

```ts
export const update = mutation({
  args: {
    studentId: v.id("students"),
    name: v.optional(v.string()),
    status: v.optional(studentStatusValidator),
    image: v.optional(v.union(v.string(), v.null())),
    groupId: v.optional(v.union(v.id("groups"), v.null())),
    ...profileFieldsArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");

    const userPatch: { name?: string; image?: string | undefined } = {};
    if (args.name !== undefined) {
      userPatch.name = normalizeName(args.name);
    }
    if (args.image !== undefined) {
      userPatch.image =
        args.image === null ? undefined : assertImageUrl(args.image);
    }
    if (args.name !== undefined || args.image !== undefined) {
      await ctx.db.patch("users", student.userId, userPatch);
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.groupId !== undefined) {
      if (args.groupId === null) {
        patch.groupId = undefined;
      } else {
        const group = await ctx.db.get("groups", args.groupId);
        if (!group || group.status !== "active") {
          throw new ConvexError("Group not found");
        }
        patch.groupId = args.groupId;
      }
    }
    Object.assign(patch, validateProfileFields(args));
    await ctx.db.patch("students", args.studentId, patch);
    return null;
  },
});
```

(`ctx.db.patch` deletes a field when its value is `undefined` — the documented way to clear `groupId`.)

4. Add a shared record validator near `profileFieldsArgs`:

```ts
const profileFieldsRecord = {
  dateOfBirth: v.union(v.string(), v.null()),
  sex: v.union(v.literal("M"), v.literal("F"), v.null()),
  parentName: v.union(v.string(), v.null()),
  parentPhone: v.union(v.string(), v.null()),
  parentEmail: v.union(v.string(), v.null()),
  joinedAt: v.union(v.string(), v.null()),
};
```

5. Replace `get`:

```ts
export const get = query({
  args: { studentId: v.id("students") },
  returns: v.union(
    v.null(),
    v.object({
      studentId: v.id("students"),
      userId: v.id("users"),
      name: v.string(),
      email: v.string(),
      image: v.union(v.string(), v.null()),
      status: v.union(v.literal("active"), v.literal("inactive")),
      groupId: v.union(v.id("groups"), v.null()),
      groupName: v.union(v.string(), v.null()),
      medicalNotes: v.union(v.string(), v.null()),
      createdAtMs: v.number(),
      ...profileFieldsRecord,
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) return null;
    const user = await ctx.db.get("users", student.userId);
    if (!user) return null;
    const group = student.groupId
      ? await ctx.db.get("groups", student.groupId)
      : null;
    return {
      studentId: student._id,
      userId: user._id,
      name: user.name ?? "",
      email: user.email ?? "",
      image: user.image ?? null,
      status: student.status,
      groupId: student.groupId ?? null,
      groupName: group?.name ?? null,
      medicalNotes: student.medicalNotes ?? null,
      createdAtMs: student._creationTime,
      dateOfBirth: student.dateOfBirth ?? null,
      sex: student.sex ?? null,
      parentName: student.parentName ?? null,
      parentPhone: student.parentPhone ?? null,
      parentEmail: student.parentEmail ?? null,
      joinedAt: student.joinedAt ?? null,
    };
  },
});
```

6. Replace `myProfile` (deliberately no `medicalNotes`):

```ts
export const myProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      email: v.string(),
      image: v.union(v.string(), v.null()),
      status: v.union(v.literal("active"), v.literal("inactive")),
      createdAtMs: v.number(),
      ...profileFieldsRecord,
    }),
  ),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) return null;
    return {
      name: self.user.name ?? "",
      email: self.user.email ?? "",
      image: self.user.image ?? null,
      status: self.student.status,
      createdAtMs: self.student._creationTime,
      dateOfBirth: self.student.dateOfBirth ?? null,
      sex: self.student.sex ?? null,
      parentName: self.student.parentName ?? null,
      parentPhone: self.student.parentPhone ?? null,
      parentEmail: self.student.parentEmail ?? null,
      joinedAt: self.student.joinedAt ?? null,
    };
  },
});
```

7. Replace `create` (action — `validateProfileFields` is a plain function callable from actions):

```ts
export const create = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    status: studentStatusValidator,
    image: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
    ...profileFieldsArgs,
  },
  returns: v.object({ studentId: v.id("students") }),
  handler: async (ctx, args) => {
    const coachId = await ctx.runQuery(internal.users.requireCoachUser, {});
    if (!coachId) throw new ConvexError(NOT_AUTHORIZED);

    const name = normalizeName(args.name);
    const email = normalizeEmail(args.email);
    assertPassword(args.password);
    const image =
      args.image !== undefined ? assertImageUrl(args.image) : undefined;
    const profile = validateProfileFields(args);

    const existing = await ctx.runQuery(internal.users.findByEmail, { email });
    if (existing) {
      throw new ConvexError("A user with this email already exists");
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: { email, name, role: "student", ...(image ? { image } : {}) },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });

    const studentId: Id<"students"> = await ctx.runMutation(
      internal.students.createProfile,
      {
        userId: created.user._id,
        status: args.status,
        ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
        ...profile,
      },
    );
    return { studentId };
  },
});
```

8. Replace `createProfile` (validates group + persists profile fields):

```ts
export const createProfile = internalMutation({
  args: {
    userId: v.id("users"),
    status: studentStatusValidator,
    groupId: v.optional(v.id("groups")),
    ...profileFieldsArgs,
  },
  returns: v.id("students"),
  handler: async (ctx, args) => {
    if (args.groupId !== undefined) {
      const group = await ctx.db.get("groups", args.groupId);
      if (!group || group.status !== "active") {
        throw new ConvexError("Group not found");
      }
    }
    const studentId = await ctx.db.insert("students", {
      userId: args.userId,
      status: args.status,
      ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
      ...validateProfileFields(args),
      updatedAt: Date.now(),
    });
    return studentId;
  },
});
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test
```

- [ ] **Step 7: Verify gates**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/lib/validation.ts convex/students.ts convex/profiles.test.ts
git commit -m "feat: swimmer profile fields with coach-only medical notes"
```

---

### Task 5: M2 UI — profile forms, detail header, student profile page

**Files:**
- Modify: `lib/format.ts` (add `ageYears`)
- Modify: `components/coach/edit-student-dialog.tsx` (profile fields)
- Modify: `components/students/create-student-dialog.tsx` (group + DOB + sex)
- Modify: `app/coach/students/[id]/page.tsx` (profile header, real groupId)
- Modify: `app/student/profile/page.tsx` (athlete info section)

**Interfaces:**
- Consumes: Task 4 query/mutation shapes.
- Produces: `ageYears(dob: string): number` in `lib/format.ts`.

- [ ] **Step 1: Add the age helper**

Append to `lib/format.ts`:

```ts
/**
 * Whole-year age from a "YYYY-MM-DD" date of birth (no timezone math).
 */
export function ageYears(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
```

- [ ] **Step 2: Extend the edit-student dialog with profile fields**

In `components/coach/edit-student-dialog.tsx`:

1. Add `Textarea` to imports: `import { Textarea } from "@/components/ui/textarea";`
2. Change `initial` to carry the profile:

```tsx
export function EditStudentDialog({
  studentId,
  initial,
}: {
  studentId: string;
  initial: {
    name: string;
    status: "active" | "inactive";
    image: string;
    groupId: string | null;
    dateOfBirth: string;
    sex: string;
    parentName: string;
    parentPhone: string;
    parentEmail: string;
    joinedAt: string;
    medicalNotes: string;
  };
}) {
```

3. Add state after the existing `image` state:

```tsx
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [sex, setSex] = useState(
    initial.sex === "M" || initial.sex === "F" ? initial.sex : "unset",
  );
  const [parentName, setParentName] = useState(initial.parentName);
  const [parentPhone, setParentPhone] = useState(initial.parentPhone);
  const [parentEmail, setParentEmail] = useState(initial.parentEmail);
  const [joinedAt, setJoinedAt] = useState(initial.joinedAt);
  const [medicalNotes, setMedicalNotes] = useState(initial.medicalNotes);
```

4. Extend the `update(...)` call inside `handleSubmit` (keep the existing `name`/`status`/`image` args):

```tsx
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(sex !== "unset" ? { sex: sex as "M" | "F" } : {}),
        ...(parentName ? { parentName } : {}),
        ...(parentPhone ? { parentPhone } : {}),
        ...(parentEmail ? { parentEmail } : {}),
        ...(joinedAt ? { joinedAt } : {}),
        ...(medicalNotes ? { medicalNotes } : {}),
```

5. Widen the dialog (`sm:max-w-lg` on `DialogContent`), update `DialogDescription` text to `Update the swimmer's profile, group and account status. The email address cannot be changed.`, and add these fields after the Group select:

```tsx
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-dob">Date of birth</Label>
              <Input
                id="edit-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-sex">Sex</Label>
              <Select value={sex} onValueChange={setSex} disabled={submitting}>
                <SelectTrigger id="edit-sex" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set</SelectItem>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-joined">Joined team on</Label>
            <Input
              id="edit-joined"
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-parent-name">Parent name</Label>
              <Input
                id="edit-parent-name"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-parent-phone">Parent phone</Label>
              <Input
                id="edit-parent-phone"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-parent-email">Parent email</Label>
            <Input
              id="edit-parent-email"
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-medical">Medical notes (coach only)</Label>
            <Textarea
              id="edit-medical"
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              disabled={submitting}
              rows={2}
            />
          </div>
```

- [ ] **Step 3: Extend the create-student dialog**

In `components/students/create-student-dialog.tsx`:

1. Add `useQuery` to the convex/react import.
2. Extend `FormState` and `initialState`:

```tsx
type FormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  status: "active" | "inactive";
  groupId: string;
  dateOfBirth: string;
  sex: string;
};

const initialState: FormState = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  status: "active",
  groupId: "unassigned",
  dateOfBirth: "",
  sex: "unset",
};
```

3. Inside the component add:

```tsx
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
```

4. Extend the `createStudent({...})` call args:

```tsx
        ...(form.groupId !== "unassigned"
          ? { groupId: form.groupId as never }
          : {}),
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        ...(form.sex !== "unset" ? { sex: form.sex as "M" | "F" } : {}),
```

5. After the Status select, add these fields:

```tsx
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-group">Training group</Label>
            <Select
              value={form.groupId}
              onValueChange={(value) => update("groupId", value)}
              disabled={submitting || groups === undefined}
            >
              <SelectTrigger id="student-group" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {activeGroups.map((group) => (
                  <SelectItem key={group.groupId} value={group.groupId}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="student-dob">Date of birth (optional)</Label>
              <Input
                id="student-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="student-sex">Sex (optional)</Label>
              <Select
                value={form.sex}
                onValueChange={(value) => update("sex", value)}
                disabled={submitting}
              >
                <SelectTrigger id="student-sex" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set</SelectItem>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
```

- [ ] **Step 4: Update the student detail page**

In `app/coach/students/[id]/page.tsx`:

1. Import: `import { ageYears, formatDate } from "@/lib/format";` (replacing the `formatDate`-only import).
2. Replace the `EditStudentDialog` `initial` prop (Task 3's `groupId: null` placeholder) with the real values:

```tsx
            <EditStudentDialog
              studentId={student.studentId}
              initial={{
                name: student.name,
                status: student.status,
                image: student.image ?? "",
                groupId: student.groupId,
                dateOfBirth: student.dateOfBirth ?? "",
                sex: student.sex ?? "unset",
                parentName: student.parentName ?? "",
                parentPhone: student.parentPhone ?? "",
                parentEmail: student.parentEmail ?? "",
                joinedAt: student.joinedAt ?? "",
                medicalNotes: student.medicalNotes ?? "",
              }}
            />
```

3. Replace the profile header Card (the one containing `StudentAvatar` with `size-14`) with:

```tsx
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <StudentAvatar
            name={student.name}
            image={student.image}
            className="size-14"
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Badge variant={student.status === "active" ? "default" : "secondary"}>
              {student.status === "active" ? "Active" : "Inactive"}
            </Badge>
            {student.groupName ? (
              <Badge variant="outline">{student.groupName}</Badge>
            ) : null}
            {student.dateOfBirth ? (
              <span className="text-muted-foreground">
                {ageYears(student.dateOfBirth)} years old
              </span>
            ) : null}
            <span className="text-muted-foreground">
              Member since{" "}
              {new Date(student.createdAtMs).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
            {student.joinedAt ? (
              <span className="text-muted-foreground">
                Joined team {formatDate(student.joinedAt)}
              </span>
            ) : null}
          </div>
          {student.parentName ||
          student.parentPhone ||
          student.parentEmail ||
          student.medicalNotes ? (
            <div className="ml-auto grid gap-0.5 text-right text-sm text-muted-foreground">
              {student.parentName ? <span>{student.parentName}</span> : null}
              {student.parentPhone ? <span>{student.parentPhone}</span> : null}
              {student.parentEmail ? <span>{student.parentEmail}</span> : null}
              {student.medicalNotes ? (
                <span className="font-medium text-foreground">
                  Medical: {student.medicalNotes}
                </span>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
```

- [ ] **Step 5: Add athlete info to the student profile page**

In `app/student/profile/page.tsx`, inside the right-hand `<div className="space-y-4">` (after the "Training Summary" heading, before the first `StatCard`), insert:

```tsx
            <Card>
              <CardHeader>
                <CardTitle>Athlete Info</CardTitle>
                <CardDescription>Managed by your coach.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {profile.dateOfBirth ? (
                  <span>Born {formatDate(profile.dateOfBirth)}</span>
                ) : null}
                {profile.sex ? (
                  <span>{profile.sex === "M" ? "Male" : "Female"}</span>
                ) : null}
                {profile.joinedAt ? (
                  <span>Joined team {formatDate(profile.joinedAt)}</span>
                ) : null}
                {!profile.dateOfBirth && !profile.sex && !profile.joinedAt ? (
                  <span className="text-muted-foreground">
                    No athlete details recorded yet.
                  </span>
                ) : null}
              </CardContent>
            </Card>
```

and add `formatDate` to the existing `@/lib/format` import.

- [ ] **Step 6: Verify gates**

```bash
npm run typecheck
npm run lint
npm test
```

- [ ] **Step 7: Manual smoke test**

Coach: create student with DOB + group; edit profile fields; detail header shows age/group/parent/medical. Student: profile page shows athlete info, no medical notes anywhere.

- [ ] **Step 8: Commit**

```bash
git add lib/format.ts components/coach/edit-student-dialog.tsx components/students/create-student-dialog.tsx "app/coach/students/[id]/page.tsx" app/student/profile/page.tsx
git commit -m "feat: swimmer profile UI for coach and student views"
```

---

### Task 6: M3 backend A — practices table + CRUD

**Files:**
- Modify: `convex/schema.ts` (`practices` table; `trainingSessions` gains `practiceId`/`distanceMeters`/`intensity` + `by_student_and_practice` index)
- Modify: `convex/lib/validation.ts` (add `assertTimeString`, `assertDistanceMeters`)
- Create: `convex/practices.ts` (`create`, `update`, `cancel`, `listForGroup`, `listUpcoming`)
- Create: `convex/practices-crud.test.ts`

**Interfaces:**
- Consumes: `requireCoach`; `assertExistingSkillKeys` from `./skills` (existing export, used by `training.ts`).
- Produces:
  - `practices` docs: `{ groupId, date, startTime?, title, plannedDurationMinutes, plannedDistanceMeters?, strokes: string[], notes?, status: "planned" | "completed" | "cancelled", completedAt?, actualDurationMinutes?, actualDistanceMeters?, updatedAt }` with indexes `by_group_and_date`, `by_date`, `by_status`.
  - `api.practices.create` args `{ groupId, date, startTime?, title, plannedDurationMinutes, plannedDistanceMeters?, strokes, notes? }` → `{ practiceId }`
  - `api.practices.update` args = create args + `practiceId` (full-field; only while `planned`; group immutable)
  - `api.practices.cancel` args `{ practiceId }`
  - `api.practices.listForGroup` args `{ groupId, fromDate?, toDate? }` → `practiceRecord[]` (desc, cap 200)
  - `api.practices.listUpcoming` args `{ fromDate }` → `practiceRecord[]` (asc, cap 100, planned only)
  - `practiceRecord` includes `groupName: string` and `_id`.
  - Task 7 adds `complete` to this same file.

- [ ] **Step 1: Write failing tests**

Create `convex/practices-crud.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

async function setup() {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  await t.run(async (ctx) => {
    await ctx.db.insert("skills", {
      key: "freestyle",
      name: "Freestyle",
      status: "active",
      updatedAt: Date.now(),
    });
  });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });
  return { t, asCoach, groupId };
}

test("coach creates a planned practice and lists it", async () => {
  const { asCoach, groupId } = await setup();
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-15",
    startTime: "17:30",
    title: "Aerobic base",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3200,
    strokes: ["freestyle"],
    notes: "4x200 free on 3:00",
  });
  expect(practiceId).toBeTruthy();

  const list = await asCoach.query(api.practices.listForGroup, {
    groupId,
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
  });
  expect(list).toMatchObject([
    {
      title: "Aerobic base",
      status: "planned",
      groupName: "Competitive",
      startTime: "17:30",
    },
  ]);
});

test("create rejects invalid time, unknown skill, and inactive group", async () => {
  const { asCoach, groupId } = await setup();
  await expect(
    asCoach.mutation(api.practices.create, {
      groupId,
      date: "2026-09-15",
      startTime: "25:00",
      title: "Bad time",
      plannedDurationMinutes: 60,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Invalid time");

  await expect(
    asCoach.mutation(api.practices.create, {
      groupId,
      date: "2026-09-15",
      title: "Bad skill",
      plannedDurationMinutes: 60,
      strokes: ["nonexistent"],
    }),
  ).rejects.toThrowError();

  await asCoach.mutation(api.groups.setStatus, { groupId, status: "archived" });
  await expect(
    asCoach.mutation(api.practices.create, {
      groupId,
      date: "2026-09-15",
      title: "Bad group",
      plannedDurationMinutes: 60,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Group not found");
});

test("planned practices can be updated and cancelled", async () => {
  const { asCoach, groupId } = await setup();
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-15",
    title: "Kick focus",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.update, {
    practiceId,
    groupId,
    date: "2026-09-16",
    title: "Kick focus (moved)",
    plannedDurationMinutes: 75,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.cancel, { practiceId });
  const list = await asCoach.query(api.practices.listForGroup, { groupId });
  expect(list[0]).toMatchObject({
    status: "cancelled",
    title: "Kick focus (moved)",
  });
});

test("update is rejected once the practice is cancelled", async () => {
  const { asCoach, groupId } = await setup();
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-15",
    title: "Sprint",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.cancel, { practiceId });
  await expect(
    asCoach.mutation(api.practices.update, {
      practiceId,
      groupId,
      date: "2026-09-15",
      title: "Sprint v2",
      plannedDurationMinutes: 60,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Only planned practices can be edited");
});

test("listUpcoming returns only future planned practices in date order", async () => {
  const { asCoach, groupId } = await setup();
  await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-10",
    title: "A",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-12",
    title: "B",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  const upcoming = await asCoach.query(api.practices.listUpcoming, {
    fromDate: "2026-09-11",
  });
  expect(upcoming.map((p) => p.title)).toEqual(["B"]);
});

test("students cannot create practices", async () => {
  const { t, groupId } = await setup();
  const { userId } = await seedStudent(t, "Alex");
  await expect(
    t
      .withIdentity({ subject: userId })
      .mutation(api.practices.create, {
        groupId,
        date: "2026-09-15",
        title: "Nope",
        plannedDurationMinutes: 60,
        strokes: ["freestyle"],
      }),
  ).rejects.toThrowError("Not authorized");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `api.practices` does not exist.

- [ ] **Step 3: Update the schema**

In `convex/schema.ts`, add the `practices` table and replace `trainingSessions`:

```ts
  practices: defineTable({
    groupId: v.id("groups"),
    date: v.string(),
    startTime: v.optional(v.string()),
    title: v.string(),
    plannedDurationMinutes: v.number(),
    plannedDistanceMeters: v.optional(v.number()),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("planned"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    completedAt: v.optional(v.number()),
    actualDurationMinutes: v.optional(v.number()),
    actualDistanceMeters: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_group_and_date", ["groupId", "date"])
    .index("by_date", ["date"])
    .index("by_status", ["status"]),
  trainingSessions: defineTable({
    studentId: v.id("students"),
    practiceId: v.optional(v.id("practices")),
    date: v.string(),
    title: v.string(),
    durationMinutes: v.number(),
    distanceMeters: v.optional(v.number()),
    intensity: v.optional(
      v.union(v.literal("easy"), v.literal("moderate"), v.literal("hard")),
    ),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_student_and_practice", ["studentId", "practiceId"])
    .index("by_date", ["date"]),
```

- [ ] **Step 4: Add validators**

Append to `convex/lib/validation.ts`:

```ts
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Times of day are stored as 24-hour "HH:MM" strings.
 */
export function assertTimeString(value: string): void {
  if (!TIME_REGEX.test(value)) {
    throw new ConvexError("Invalid time: expected HH:MM (24-hour)");
  }
}

export function assertDistanceMeters(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 30000) {
    throw new ConvexError("Distance must be between 1 and 30000 meters");
  }
}
```

- [ ] **Step 5: Create convex/practices.ts**

```ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { assertExistingSkillKeys } from "./skills";
import {
  assertDateString,
  assertDistanceMeters,
  assertDuration,
  assertTimeString,
} from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const practiceStatusValidator = v.union(
  v.literal("planned"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const practiceRecord = v.object({
  _id: v.id("practices"),
  groupId: v.id("groups"),
  groupName: v.string(),
  date: v.string(),
  startTime: v.union(v.string(), v.null()),
  title: v.string(),
  plannedDurationMinutes: v.number(),
  plannedDistanceMeters: v.union(v.number(), v.null()),
  strokes: v.array(v.string()),
  notes: v.union(v.string(), v.null()),
  status: practiceStatusValidator,
  completedAt: v.union(v.number(), v.null()),
  actualDurationMinutes: v.union(v.number(), v.null()),
  actualDistanceMeters: v.union(v.number(), v.null()),
});

type PracticeDoc = Doc<"practices">;

function validatePracticeFields(args: {
  date: string;
  startTime?: string;
  title: string;
  plannedDurationMinutes: number;
  plannedDistanceMeters?: number;
  strokes: string[];
  notes?: string;
}) {
  assertDateString(args.date);
  if (args.startTime !== undefined) assertTimeString(args.startTime);
  const title = args.title.trim();
  if (title.length === 0 || title.length > 120) {
    throw new ConvexError("Title must be between 1 and 120 characters");
  }
  assertDuration(args.plannedDurationMinutes);
  if (args.plannedDistanceMeters !== undefined) {
    assertDistanceMeters(args.plannedDistanceMeters);
  }
  const strokes = [...new Set(args.strokes)];
  if (strokes.length === 0) {
    throw new ConvexError("Select at least one skill");
  }
  if (args.notes !== undefined && args.notes.trim().length > 5000) {
    throw new ConvexError("Notes must be at most 5000 characters");
  }
  return {
    date: args.date,
    startTime: args.startTime,
    title,
    plannedDurationMinutes: args.plannedDurationMinutes,
    plannedDistanceMeters: args.plannedDistanceMeters,
    strokes,
    notes: args.notes?.trim() || undefined,
  };
}

async function requireActiveGroup(
  ctx: QueryCtx,
  groupId: Id<"groups">,
): Promise<Doc<"groups">> {
  const group = await ctx.db.get("groups", groupId);
  if (!group || group.status !== "active") {
    throw new ConvexError("Group not found");
  }
  return group;
}

async function toRecord(ctx: QueryCtx, practice: PracticeDoc) {
  const group = await ctx.db.get("groups", practice.groupId);
  return {
    _id: practice._id,
    groupId: practice.groupId,
    groupName: group?.name ?? "Unknown",
    date: practice.date,
    startTime: practice.startTime ?? null,
    title: practice.title,
    plannedDurationMinutes: practice.plannedDurationMinutes,
    plannedDistanceMeters: practice.plannedDistanceMeters ?? null,
    strokes: practice.strokes,
    notes: practice.notes ?? null,
    status: practice.status,
    completedAt: practice.completedAt ?? null,
    actualDurationMinutes: practice.actualDurationMinutes ?? null,
    actualDistanceMeters: practice.actualDistanceMeters ?? null,
  };
}

/**
 * Coach-only: schedule a practice for a group.
 */
export const create = mutation({
  args: {
    groupId: v.id("groups"),
    date: v.string(),
    startTime: v.optional(v.string()),
    title: v.string(),
    plannedDurationMinutes: v.number(),
    plannedDistanceMeters: v.optional(v.number()),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({ practiceId: v.id("practices") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    await requireActiveGroup(ctx, args.groupId);
    const fields = validatePracticeFields(args);
    await assertExistingSkillKeys(ctx, fields.strokes);
    const practiceId = await ctx.db.insert("practices", {
      groupId: args.groupId,
      ...fields,
      status: "planned",
      updatedAt: Date.now(),
    });
    return { practiceId };
  },
});

/**
 * Coach-only: edit a practice. Full-field update; only possible
 * while still planned. Group is immutable — recreate instead.
 */
export const update = mutation({
  args: {
    practiceId: v.id("practices"),
    groupId: v.id("groups"),
    date: v.string(),
    startTime: v.optional(v.string()),
    title: v.string(),
    plannedDurationMinutes: v.number(),
    plannedDistanceMeters: v.optional(v.number()),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const practice = await ctx.db.get("practices", args.practiceId);
    if (!practice) throw new ConvexError("Practice not found");
    if (practice.status !== "planned") {
      throw new ConvexError("Only planned practices can be edited");
    }
    if (practice.groupId !== args.groupId) {
      throw new ConvexError("Group cannot be changed; recreate the practice");
    }
    const fields = validatePracticeFields(args);
    await assertExistingSkillKeys(ctx, fields.strokes);
    await ctx.db.patch("practices", args.practiceId, {
      ...fields,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: cancel a planned practice.
 */
export const cancel = mutation({
  args: { practiceId: v.id("practices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const practice = await ctx.db.get("practices", args.practiceId);
    if (!practice) throw new ConvexError("Practice not found");
    if (practice.status !== "planned") {
      throw new ConvexError("Only planned practices can be cancelled");
    }
    await ctx.db.patch("practices", args.practiceId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: a group's practices in a date range (defaults to all),
 * newest first, cap 200.
 */
export const listForGroup = query({
  args: {
    groupId: v.id("groups"),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  returns: v.array(practiceRecord),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    if (args.fromDate !== undefined) assertDateString(args.fromDate);
    if (args.toDate !== undefined) assertDateString(args.toDate);

    const practices = await ctx.db
      .query("practices")
      .withIndex("by_group_and_date", (q) => {
        let cursor = q.eq("groupId", args.groupId);
        if (args.fromDate !== undefined) cursor = cursor.gte("date", args.fromDate);
        if (args.toDate !== undefined) cursor = cursor.lte("date", args.toDate);
        return cursor;
      })
      .order("desc")
      .take(200);

    return Promise.all(practices.map((practice) => toRecord(ctx, practice)));
  },
});

/**
 * Coach-only: upcoming (or same-day) planned practices across all
 * groups, oldest first. `fromDate` is passed by the client —
 * queries never read the wall clock.
 */
export const listUpcoming = query({
  args: { fromDate: v.string() },
  returns: v.array(practiceRecord),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertDateString(args.fromDate);
    const practices = await ctx.db
      .query("practices")
      .withIndex("by_date", (q) => q.gte("date", args.fromDate))
      .order("asc")
      .take(100);
    const planned = practices.filter((p) => p.status === "planned");
    return Promise.all(planned.map((practice) => toRecord(ctx, practice)));
  },
});
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test
```

- [ ] **Step 7: Verify gates**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/lib/validation.ts convex/practices.ts convex/practices-crud.test.ts
git commit -m "feat: practice planning with group scheduling and status workflow"
```

---

### Task 7: M3 backend B — complete fan-out + commitment %

**Files:**
- Modify: `convex/practices.ts` (add `complete`)
- Modify: `convex/lib/stats.ts` (add `commitmentStats`)
- Modify: `convex/students.ts` (`get` returns `commitment`)
- Modify: `app/coach/students/[id]/page.tsx` (commitment StatCard)
- Create: `convex/practices-complete.test.ts`

**Interfaces:**
- Consumes: Task 6 schema and CRUD; `api.attendance.record` (existing); `api.training.listForStudent` (existing — returns a bare array of session records).
- Produces:
  - `api.practices.complete` args `{ practiceId, actualDurationMinutes?, actualDistanceMeters? }` → `{ sessionsCreated, sessionsUpdated, sessionsSkipped }`. Idempotent; re-running patches sessions and applies new actuals.
  - `commitmentStats(ctx, studentId)` → `{ held, attended, percentage: number | null } | null` in `convex/lib/stats.ts` (null when student has no group).
  - `api.students.get` gains `commitment: { held: number; attended: number; percentage: number | null } | null`.

**Fan-out rule (spec §M3):** for each ACTIVE member of the practice's group — if a fan-out session exists for (student, practice) → patch it; else if an attendance record exists for (student, date) with status `absent` → skip; else insert a session. Session content: practice date/title/strokes, actual duration (fallback planned), actual distance (fallback planned), notes `From practice: …` capped at 2000 chars, `practiceId` set. Re-running `complete` keeps the original `completedAt` and patches the practice actuals.

- [ ] **Step 1: Write failing tests**

Create `convex/practices-complete.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

const DATE = "2026-09-10";

async function setup() {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  await t.run(async (ctx) => {
    await ctx.db.insert("skills", {
      key: "freestyle",
      name: "Freestyle",
      status: "active",
      updatedAt: Date.now(),
    });
  });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });
  const alex = await seedStudent(t, "Alex Santos");
  const maria = await seedStudent(t, "Maria Reyes");
  const daniel = await seedStudent(t, "Daniel Cruz");
  for (const s of [alex, maria, daniel]) {
    await asCoach.mutation(api.groups.assignStudent, {
      studentId: s.studentId,
      groupId,
    });
  }
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: DATE,
    title: "Aerobic base",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3000,
    strokes: ["freestyle"],
    notes: "4x200 free",
  });
  return { t, asCoach, groupId, practiceId, alex, maria, daniel };
}

test("complete fans out sessions to attendees, skips absent members", async () => {
  const { asCoach, practiceId, alex, maria, daniel } = await setup();
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: DATE,
    status: "present",
  });
  await asCoach.mutation(api.attendance.record, {
    studentId: maria.studentId as never,
    date: DATE,
    status: "absent",
  });

  const result = await asCoach.mutation(api.practices.complete, {
    practiceId,
    actualDurationMinutes: 85,
  });
  expect(result).toMatchObject({
    sessionsCreated: 2,
    sessionsUpdated: 0,
    sessionsSkipped: 1,
  });

  const alexSessions = await asCoach.query(api.training.listForStudent, {
    studentId: alex.studentId as never,
  });
  expect(alexSessions).toMatchObject([
    {
      title: "Aerobic base",
      durationMinutes: 85,
      strokes: ["freestyle"],
    },
  ]);
  // distanceMeters/practiceId are verified directly in the DB (they are
  // exposed through listForStudent in Task 12).
  const alexDoc = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_practice", (q) =>
        q.eq("studentId", alex.studentId as never).eq("practiceId", practiceId),
      )
      .take(1);
    return rows[0];
  });
  expect(alexDoc).toMatchObject({ distanceMeters: 3000 });

  const mariaSessions = await asCoach.query(api.training.listForStudent, {
    studentId: maria.studentId as never,
  });
  expect(mariaSessions).toHaveLength(0);

  const danielSessions = await asCoach.query(api.training.listForStudent, {
    studentId: daniel.studentId as never,
  });
  expect(danielSessions).toHaveLength(1);
});

test("re-completing patches sessions instead of duplicating them", async () => {
  const { t, asCoach, practiceId, alex } = await setup();
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: DATE,
    status: "present",
  });
  await asCoach.mutation(api.practices.complete, { practiceId });
  const second = await asCoach.mutation(api.practices.complete, {
    practiceId,
    actualDurationMinutes: 70,
    actualDistanceMeters: 2500,
  });
  expect(second).toMatchObject({
    sessionsCreated: 0,
    sessionsUpdated: 3,
    sessionsSkipped: 0,
  });
  const sessions = await asCoach.query(api.training.listForStudent, {
    studentId: alex.studentId as never,
  });
  expect(sessions).toHaveLength(1);
  const alexDoc = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_practice", (q) =>
        q.eq("studentId", alex.studentId as never).eq("practiceId", practiceId),
      )
      .take(1);
    return rows[0];
  });
  expect(alexDoc).toMatchObject({ durationMinutes: 70, distanceMeters: 2500 });
});

test("commitment percentage = attended / completed group practices since join", async () => {
  const { asCoach, groupId, practiceId, alex } = await setup();
  const { practiceId: p2 } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-12",
    title: "Second",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.students.update, {
    studentId: alex.studentId as never,
    joinedAt: "2026-09-01",
  });
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: DATE,
    status: "present",
  });
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: "2026-09-12",
    status: "absent",
  });
  await asCoach.mutation(api.practices.complete, { practiceId });
  await asCoach.mutation(api.practices.complete, { practiceId: p2 });

  const detail = await asCoach.query(api.students.get, {
    studentId: alex.studentId as never,
  });
  expect(detail?.commitment).toMatchObject({
    held: 2,
    attended: 1,
    percentage: 50,
  });
});

test("commitment is null for students without a group", async () => {
  const { t, asCoach } = await setup();
  const loner = await seedStudent(t, "Solo Swimmer");
  const detail = await asCoach.query(api.students.get, {
    studentId: loner.studentId as never,
  });
  expect(detail?.commitment).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `api.practices.complete` does not exist; `commitment` missing from `students.get`.

- [ ] **Step 3: Implement complete in convex/practices.ts**

Append to `convex/practices.ts`:

```ts
/**
 * Coach-only: mark a practice completed and fan out one training
 * session per active group member (idempotent — keyed by
 * (studentId, practiceId)). Members recorded absent on the practice
 * date are skipped; members with present/late or no attendance
 * record get a session. Re-running updates actuals and patches
 * existing fan-out sessions.
 */
export const complete = mutation({
  args: {
    practiceId: v.id("practices"),
    actualDurationMinutes: v.optional(v.number()),
    actualDistanceMeters: v.optional(v.number()),
  },
  returns: v.object({
    sessionsCreated: v.number(),
    sessionsUpdated: v.number(),
    sessionsSkipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const practice = await ctx.db.get("practices", args.practiceId);
    if (!practice) throw new ConvexError("Practice not found");
    if (practice.status === "cancelled") {
      throw new ConvexError("Cannot complete a cancelled practice");
    }
    const actualDuration =
      args.actualDurationMinutes ?? practice.plannedDurationMinutes;
    assertDuration(actualDuration);
    const actualDistance =
      args.actualDistanceMeters ?? practice.plannedDistanceMeters;
    if (actualDistance !== undefined) assertDistanceMeters(actualDistance);

    const members = await ctx.db
      .query("students")
      .withIndex("by_group", (q) => q.eq("groupId", practice.groupId))
      .take(500);

    let sessionsCreated = 0;
    let sessionsUpdated = 0;
    let sessionsSkipped = 0;

    for (const member of members) {
      if (member.status !== "active") {
        sessionsSkipped += 1;
        continue;
      }
      const existing = await ctx.db
        .query("trainingSessions")
        .withIndex("by_student_and_practice", (q) =>
          q.eq("studentId", member._id).eq("practiceId", practice._id),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("trainingSessions", existing._id, {
          date: practice.date,
          title: practice.title,
          durationMinutes: actualDuration,
          ...(actualDistance !== undefined ? { distanceMeters: actualDistance } : {}),
          strokes: practice.strokes,
          updatedAt: Date.now(),
        });
        sessionsUpdated += 1;
        continue;
      }
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", member._id).eq("date", practice.date),
        )
        .unique();
      if (attendance?.status === "absent") {
        sessionsSkipped += 1;
        continue;
      }
      await ctx.db.insert("trainingSessions", {
        studentId: member._id,
        practiceId: practice._id,
        date: practice.date,
        title: practice.title,
        durationMinutes: actualDuration,
        ...(actualDistance !== undefined ? { distanceMeters: actualDistance } : {}),
        strokes: practice.strokes,
        notes: `From practice: ${practice.notes ?? ""}`.slice(0, 2000),
        updatedAt: Date.now(),
      });
      sessionsCreated += 1;
    }

    await ctx.db.patch("practices", practice._id, {
      status: "completed",
      completedAt: practice.completedAt ?? Date.now(),
      actualDurationMinutes: actualDuration,
      ...(actualDistance !== undefined ? { actualDistanceMeters: actualDistance } : {}),
      updatedAt: Date.now(),
    });
    return { sessionsCreated, sessionsUpdated, sessionsSkipped };
  },
});
```

- [ ] **Step 4: Add commitmentStats to convex/lib/stats.ts**

Append to `convex/lib/stats.ts`:

```ts
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
  const practices = await ctx.db
    .query("practices")
    .withIndex("by_group_and_date", (q) => q.eq("groupId", student.groupId))
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
```

- [ ] **Step 5: Expose commitment in students.get**

In `convex/students.ts`:

1. Change the stats import to `import { attendanceStats, commitmentStats, overallProgress } from "./lib/stats";`
2. Add to the `get` return validator object: `commitment: v.union(v.null(), v.object({ held: v.number(), attended: v.number(), percentage: v.union(v.number(), v.null()) })),`
3. In the `get` handler, before the return: `const commitment = await commitmentStats(ctx, student._id);` and add `commitment` to the returned object.

- [ ] **Step 6: Add the commitment StatCard**

In `app/coach/students/[id]/page.tsx`, change the stats grid to `className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"` and add this card after the Attendance StatCard:

```tsx
        <StatCard
          icon={Target}
          label="Commitment"
          value={
            student.commitment === null || student.commitment.percentage === null
              ? "—"
              : `${student.commitment.percentage}%`
          }
          hint={
            student.commitment === null
              ? "Assign a training group to track commitment"
              : student.commitment.percentage === null
                ? "No completed group practices yet"
                : `${student.commitment.attended} of ${student.commitment.held} group practices attended`
          }
        />
```

(`Target` is already imported in that file.)

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test
```

Expected: all PASS, including fan-out idempotency and commitment math.

- [ ] **Step 8: Verify gates**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add convex/practices.ts convex/lib/stats.ts convex/students.ts "app/coach/students/[id]/page.tsx" convex/practices-complete.test.ts
git commit -m "feat: one-click practice completion with session fan-out and commitment tracking"
```

---

### Task 8: M3 UI — practices page and dialogs

**Files:**
- Create: `components/coach/practice-form-dialog.tsx`
- Create: `components/coach/complete-practice-dialog.tsx`
- Create: `app/coach/practices/page.tsx`
- Modify: `components/layout/app-shell.tsx` (add `CalendarClock` icon)
- Modify: `app/coach/layout.tsx` (Practices nav item)

**Interfaces:**
- Consumes: `api.practices.*` (Tasks 6–7), `api.groups.list`, `api.skills.catalog` (returns `{ skillId, key, name, status }[]`).
- Produces:
  - `PracticeFormDialog` props: `{ mode: "create"; groupId: string } | { mode: "edit"; groupId: string; practice: { _id: string; date: string; startTime: string | null; title: string; plannedDurationMinutes: number; plannedDistanceMeters: number | null; strokes: string[]; notes: string | null } }`
  - `CompletePracticeDialog` props: `{ practice: { _id: string; title: string; groupName: string; date: string; plannedDurationMinutes: number; plannedDistanceMeters: number | null }; triggerLabel?: string }`

- [ ] **Step 1: Add the nav icon + item**

In `components/layout/app-shell.tsx`: add `CalendarClock` to the lucide import, the `NavIconName` union, and `iconMap`.

In `app/coach/layout.tsx`, insert after the Groups item:

```ts
  { href: "/coach/practices", label: "Practices", icon: "CalendarClock" },
```

- [ ] **Step 2: Create the practice form dialog**

Create `components/coach/practice-form-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/lib/format";

type Initial = {
  date: string;
  startTime: string;
  title: string;
  plannedDurationMinutes: string;
  plannedDistanceMeters: string;
  strokes: string[];
  notes: string;
};

function initialFor(
  groupId: string,
  practice?: {
    date: string;
    startTime: string | null;
    title: string;
    plannedDurationMinutes: number;
    plannedDistanceMeters: number | null;
    strokes: string[];
    notes: string | null;
  },
): Initial {
  return {
    date: practice?.date ?? "",
    startTime: practice?.startTime ?? "",
    title: practice?.title ?? "",
    plannedDurationMinutes: practice
      ? String(practice.plannedDurationMinutes)
      : "",
    plannedDistanceMeters: practice
      ? (practice.plannedDistanceMeters?.toString() ?? "")
      : "",
    strokes: practice?.strokes ?? [],
    notes: practice?.notes ?? "",
  };
}

export function PracticeFormDialog({
  mode,
  groupId,
  practice,
}: {
  mode: "create" | "edit";
  groupId: string;
  practice?: {
    _id: string;
    date: string;
    startTime: string | null;
    title: string;
    plannedDurationMinutes: number;
    plannedDistanceMeters: number | null;
    strokes: string[];
    notes: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Initial>(() => initialFor(groupId, practice));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const create = useMutation(api.practices.create);
  const update = useMutation(api.practices.update);
  const catalog = useQuery(api.skills.catalog, {});
  const activeSkills = (catalog ?? []).filter((s) => s.status === "active");

  useEffect(() => {
    if (open) {
      setForm(initialFor(groupId, practice));
      setError(null);
    }
  }, [open, groupId, practice]);

  function toggleStroke(key: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      strokes: checked
        ? [...prev.strokes, key]
        : prev.strokes.filter((s) => s !== key),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const title = form.title.trim();
    const duration = Number(form.plannedDurationMinutes);
    const distance = form.plannedDistanceMeters.trim();
    if (title.length === 0) {
      setError("Title is required.");
      return;
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      setError("Planned duration must be a positive number of minutes.");
      return;
    }
    if (distance !== "" && !Number.isInteger(Number(distance))) {
      setError("Planned distance must be a whole number of meters.");
      return;
    }
    if (form.strokes.length === 0) {
      setError("Select at least one skill.");
      return;
    }

    setSubmitting(true);
    try {
      const args = {
        groupId: groupId as never,
        date: form.date,
        ...(form.startTime ? { startTime: form.startTime } : {}),
        title,
        plannedDurationMinutes: duration,
        ...(distance !== "" ? { plannedDistanceMeters: Number(distance) } : {}),
        strokes: form.strokes,
        ...(form.notes.trim() ? { notes: form.notes } : {}),
      };
      if (mode === "create") {
        await create(args);
        toast.success("Practice scheduled.");
      } else {
        await update({ ...args, practiceId: practice!._id as never });
        toast.success("Practice updated.");
      }
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save the practice. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button disabled={!groupId}>
            <Plus className="size-4" aria-hidden="true" />
            Schedule Practice
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={submitting}>
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Schedule Practice" : "Edit Practice"}
          </DialogTitle>
          <DialogDescription>
            Plan a workout for the group. Completing it later logs a session
            for every swimmer who attended.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-date">Date</Label>
              <Input
                id="practice-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-time">Start time (optional)</Label>
              <Input
                id="practice-time"
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((p) => ({ ...p, startTime: e.target.value }))
                }
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="practice-title">Title</Label>
            <Input
              id="practice-title"
              placeholder="Aerobic base"
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-duration">Duration (min)</Label>
              <Input
                id="practice-duration"
                type="number"
                min={1}
                max={600}
                required
                value={form.plannedDurationMinutes}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    plannedDurationMinutes: e.target.value,
                  }))
                }
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-distance">Planned distance (m)</Label>
              <Input
                id="practice-distance"
                type="number"
                min={1}
                max={30000}
                placeholder="3000"
                value={form.plannedDistanceMeters}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    plannedDistanceMeters: e.target.value,
                  }))
                }
                disabled={submitting}
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Focus skills</legend>
            <div className="flex flex-wrap gap-3">
              {activeSkills.map((skill) => (
                <label
                  key={skill.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.strokes.includes(skill.key)}
                    onCheckedChange={(checked) =>
                      toggleStroke(skill.key, checked === true)
                    }
                    disabled={submitting}
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="practice-notes">Workout notes</Label>
            <Textarea
              id="practice-notes"
              placeholder="4x200 free on 3:00, 8x50 kick…"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : mode === "create"
                  ? "Schedule"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create the complete-practice dialog**

Create `components/coach/complete-practice-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage, formatDate } from "@/lib/format";

export function CompletePracticeDialog({
  practice,
  triggerLabel = "Mark Completed",
}: {
  practice: {
    _id: string;
    title: string;
    groupName: string;
    date: string;
    plannedDurationMinutes: number;
    plannedDistanceMeters: number | null;
  };
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(
    String(practice.plannedDurationMinutes),
  );
  const [distance, setDistance] = useState(
    practice.plannedDistanceMeters?.toString() ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const complete = useMutation(api.practices.complete);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsedDuration = Number(duration);
    if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) {
      setError("Actual duration must be a positive number of minutes.");
      return;
    }
    const trimmed = distance.trim();
    if (trimmed !== "" && !Number.isInteger(Number(trimmed))) {
      setError("Actual distance must be a whole number of meters.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await complete({
        practiceId: practice._id as never,
        actualDurationMinutes: parsedDuration,
        ...(trimmed !== "" ? { actualDistanceMeters: Number(trimmed) } : {}),
      });
      toast.success(
        `Practice completed — ${result.sessionsCreated} sessions logged, ` +
          `${result.sessionsUpdated} updated, ${result.sessionsSkipped} skipped (absent).`,
      );
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to complete the practice. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Practice</DialogTitle>
          <DialogDescription>
            {practice.title} — {practice.groupName}, {formatDate(practice.date)}.
            A training session is logged for every swimmer who attended
            (swimmers marked absent are skipped).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="actual-duration">Actual duration (min)</Label>
              <Input
                id="actual-duration"
                type="number"
                min={1}
                max={600}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="actual-distance">Actual distance (m)</Label>
              <Input
                id="actual-distance"
                type="number"
                min={1}
                max={30000}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Completing…" : "Complete & Log Sessions"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the practices page**

Create `app/coach/practices/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CalendarClock, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PracticeFormDialog } from "@/components/coach/practice-form-dialog";
import { CompletePracticeDialog } from "@/components/coach/complete-practice-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, formatDate, todayDateString } from "@/lib/format";

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const statusBadge: Record<string, string> = {
  planned: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400",
  completed:
    "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cancelled:
    "bg-rose-600/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

export default function CoachPracticesPage() {
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
  const [groupFilter, setGroupFilter] = useState<string>("first");
  const effectiveGroup =
    groupFilter !== "first" && groupFilter !== ""
      ? groupFilter
      : (activeGroups[0]?.groupId ?? "");
  const practices = useQuery(
    api.practices.listForGroup,
    effectiveGroup
      ? {
          groupId: effectiveGroup as never,
          fromDate: dateOffset(-30),
          toDate: dateOffset(60),
        }
      : "skip",
  );
  const cancel = useMutation(api.practices.cancel);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancelPractice(practiceId: string, title: string) {
    if (busyId !== null) return;
    setError(null);
    setBusyId(practiceId);
    try {
      await cancel({ practiceId: practiceId as never });
      toast.success(`"${title}" cancelled.`);
      setBusyId(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to cancel. Please try again."));
      setBusyId(null);
    }
  }

  const today = todayDateString();
  const upcoming = (practices ?? []).filter(
    (p) => p.date >= today && p.status === "planned",
  );
  const past = (practices ?? []).filter(
    (p) => p.date < today || p.status !== "planned",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practices"
        description="Plan group workouts and log them as completed sessions in one click."
        actions={<PracticeFormDialog mode="create" groupId={effectiveGroup} />}
      />

      <Select
        value={effectiveGroup}
        onValueChange={setGroupFilter}
        disabled={groups === undefined}
      >
        <SelectTrigger className="w-full max-w-56" aria-label="Filter by group">
          <SelectValue
            placeholder={
              groups !== undefined && activeGroups.length === 0
                ? "No groups yet"
                : undefined
            }
          />
        </SelectTrigger>
        <SelectContent>
          {activeGroups.map((group) => (
            <SelectItem key={group.groupId} value={group.groupId}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {groups !== undefined && activeGroups.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No training groups"
          description="Create a group first, then schedule practices for it."
        />
      ) : practices === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled for this group in the next 60 days.
                </p>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((practice) => (
                    <li
                      key={practice._id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{practice.title}</span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-medium",
                              statusBadge[practice.status],
                            )}
                          >
                            {practice.plannedDurationMinutes} min
                            {practice.plannedDistanceMeters !== null
                              ? ` · ${practice.plannedDistanceMeters.toLocaleString()} m`
                              : ""}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(practice.date)}
                          {practice.startTime ? ` at ${practice.startTime}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CompletePracticeDialog practice={practice} />
                        <PracticeFormDialog
                          mode="edit"
                          groupId={practice.groupId}
                          practice={practice}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId !== null}
                          onClick={() =>
                            void cancelPractice(practice._id, practice.title)
                          }
                        >
                          <XCircle className="size-4" aria-hidden="true" />
                          Cancel
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Past 30 days
              </h2>
              {past.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed or cancelled practices yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {past.map((practice) => (
                    <li
                      key={practice._id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{practice.title}</span>
                          <Badge
                            variant="secondary"
                            className={cn(statusBadge[practice.status])}
                          >
                            {practice.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(practice.date)}
                          {practice.status === "completed"
                            ? ` — ${practice.actualDurationMinutes ?? "?"} min${
                                practice.actualDistanceMeters !== null
                                  ? ` · ${practice.actualDistanceMeters.toLocaleString()} m`
                                  : ""
                              }`
                            : ""}
                        </p>
                      </div>
                      {practice.status === "planned" ? (
                        <CompletePracticeDialog practice={practice} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify gates**

```bash
npm run typecheck
npm run lint
npm test
```

- [ ] **Step 6: Manual smoke test**

Coach: schedule a practice for a group (past date), take roll call for that date (Task 10 adds bulk — single-record works meanwhile), then Mark Completed and verify sessions appear on each swimmer's profile.

- [ ] **Step 7: Commit**

```bash
git add components/coach/practice-form-dialog.tsx components/coach/complete-practice-dialog.tsx app/coach/practices/page.tsx components/layout/app-shell.tsx app/coach/layout.tsx
git commit -m "feat: practices page with scheduling, completion, and cancellation"
```

---

### Task 9: M4 backend — bulk roll call + roll-call group filter

**Files:**
- Modify: `convex/attendance.ts` (add `recordBulk`; `rollCall` gains optional `groupId`)
- Create: `convex/attendance-bulk.test.ts`

**Interfaces:**
- Consumes: existing `attendance.record` upsert semantics; Task 2 groups.
- Produces:
  - `api.attendance.recordBulk` args `{ date: string, entries: [{ studentId: Id<"students">, status: "present" | "late" | "absent" }] }` (1–200 entries, duplicates last-wins) → `{ recorded: number }`. Coach-only, single transaction.
  - `api.attendance.rollCall` args gain `groupId?: Id<"groups"> | null` (undefined = all active students, null = unassigned only).

- [ ] **Step 1: Write failing tests**

Create `convex/attendance-bulk.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

const DATE = "2026-09-10";

test("recordBulk writes all entries in one call and reports the count", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const a = await seedStudent(t, "Alex Santos");
  const b = await seedStudent(t, "Maria Reyes");

  const result = await asCoach.mutation(api.attendance.recordBulk, {
    date: DATE,
    entries: [
      { studentId: a.studentId as never, status: "present" },
      { studentId: b.studentId as never, status: "late" },
    ],
  });
  expect(result).toEqual({ recorded: 2 });

  const rollCall = await asCoach.query(api.attendance.rollCall, { date: DATE });
  const byName = Object.fromEntries(rollCall.map((r) => [r.name, r.status]));
  expect(byName).toEqual({ "Alex Santos": "present", "Maria Reyes": "late" });
});

test("recordBulk is an upsert — re-recording updates in place", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const a = await seedStudent(t, "Alex Santos");

  await asCoach.mutation(api.attendance.recordBulk, {
    date: DATE,
    entries: [{ studentId: a.studentId as never, status: "present" }],
  });
  await asCoach.mutation(api.attendance.recordBulk, {
    date: DATE,
    entries: [{ studentId: a.studentId as never, status: "absent" }],
  });

  const rollCall = await asCoach.query(api.attendance.rollCall, { date: DATE });
  expect(rollCall[0].status).toBe("absent");
  expect(rollCall).toHaveLength(1);
});

test("recordBulk rejects empty payloads, >200 entries, unknown students, non-coaches", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const a = await seedStudent(t, "Alex Santos");

  await expect(
    asCoach.mutation(api.attendance.recordBulk, { date: DATE, entries: [] }),
  ).rejects.toThrowError("At least one entry is required");

  const tooMany = Array.from({ length: 201 }, () => ({
    studentId: a.studentId as never,
    status: "present" as const,
  }));
  await expect(
    asCoach.mutation(api.attendance.recordBulk, {
      date: DATE,
      entries: tooMany,
    }),
  ).rejects.toThrowError("At most 200 entries per roll call");

  await expect(
    asCoach.mutation(api.attendance.recordBulk, {
      date: DATE,
      entries: [
        { studentId: "k57hqz8q2vbt3a7v8eyhk15h6e6" as never, status: "present" },
      ],
    }),
  ).rejects.toThrowError("Student not found");

  await expect(
    t
      .withIdentity({ subject: a.userId })
      .mutation(api.attendance.recordBulk, {
        date: DATE,
        entries: [{ studentId: a.studentId as never, status: "present" }],
      }),
  ).rejects.toThrowError("Not authorized");
});

test("rollCall filters by group", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });
  const a = await seedStudent(t, "Alex Santos");
  await seedStudent(t, "Maria Reyes");
  await asCoach.mutation(api.groups.assignStudent, {
    studentId: a.studentId,
    groupId,
  });
  await asCoach.mutation(api.attendance.recordBulk, {
    date: DATE,
    entries: [
      { studentId: a.studentId as never, status: "present" },
      { studentId: (await seedStudent(t, "X")).studentId as never, status: "late" },
    ],
  });

  const groupRoll = await asCoach.query(api.attendance.rollCall, {
    date: DATE,
    groupId,
  });
  expect(groupRoll.map((r) => r.name)).toEqual(["Alex Santos"]);

  const unassigned = await asCoach.query(api.attendance.rollCall, {
    date: DATE,
    groupId: null,
  });
  expect(unassigned.map((r) => r.name)).toContain("Maria Reyes");
});
```

Note: the "unknown student" test uses a syntactically valid but nonexistent Convex id string — if the id format check rejects it first with a different error, that also satisfies the test intent; adjust the expected message accordingly.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `api.attendance.recordBulk` does not exist; `rollCall` rejects `groupId`.

- [ ] **Step 3: Add recordBulk to convex/attendance.ts**

Append to `convex/attendance.ts` (after `record`):

```ts
/**
 * Coach-only: record or update roll call for many students on one
 * date in a single transaction. One record per student per date
 * (upsert, duplicates last-wins), max 200 entries.
 */
export const recordBulk = mutation({
  args: {
    date: v.string(),
    entries: v.array(
      v.object({
        studentId: v.id("students"),
        status: attendanceStatusValidator,
      }),
    ),
  },
  returns: v.object({ recorded: v.number() }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertDateString(args.date);
    if (args.entries.length === 0) {
      throw new ConvexError("At least one entry is required");
    }
    if (args.entries.length > 200) {
      throw new ConvexError("At most 200 entries per roll call");
    }

    const byStudent = new Map(
      args.entries.map((entry) => [entry.studentId, entry.status]),
    );
    let recorded = 0;
    for (const [studentId, status] of byStudent) {
      const student = await ctx.db.get("students", studentId);
      if (!student) throw new ConvexError("Student not found");
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", studentId).eq("date", args.date),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("attendance", existing._id, {
          status,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("attendance", {
          studentId,
          date: args.date,
          status,
          updatedAt: Date.now(),
        });
      }
      recorded += 1;
    }
    return { recorded };
  },
});
```

- [ ] **Step 4: Add group filter to rollCall**

In `convex/attendance.ts`, change `rollCall`'s args and add the filter at the top of the students loop:

```ts
export const rollCall = query({
  args: {
    date: v.string(),
    groupId: v.optional(v.union(v.id("groups"), v.null())),
  },
  returns: v.array(
    v.object({
      studentId: v.id("students"),
      name: v.string(),
      status: v.union(
        v.literal("present"),
        v.literal("late"),
        v.literal("absent"),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    assertDateString(args.date);

    const students = await ctx.db.query("students").take(500);
    const rows = await Promise.all(
      students.map(async (student) => {
        if (student.status !== "active") return null;
        if (args.groupId !== undefined) {
          if (args.groupId === null) {
            if (student.groupId !== undefined) return null;
          } else if (student.groupId !== args.groupId) {
            return null;
          }
        }
        const user = await ctx.db.get("users", student.userId);
        if (!user) return null;
        const record = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q.eq("studentId", student._id).eq("date", args.date),
          )
          .unique();
        return {
          studentId: student._id,
          name: user.name ?? "",
          status: record?.status ?? null,
        };
      }),
    );
    return rows.filter((r) => r !== null).sort((a, b) => a.name.localeCompare(b.name));
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

- [ ] **Step 6: Verify gates**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add convex/attendance.ts convex/attendance-bulk.test.ts
git commit -m "feat: bulk roll call mutation and group-filtered roll-call view"
```

---

### Task 10: M4 UI — roll-call mode upgrade

**Files:**
- Modify: `app/coach/attendance/page.tsx` (replace the roll-call card interactions)

**Interfaces:**
- Consumes: `api.attendance.rollCall` (now with `groupId`), `api.attendance.recordBulk` (Task 9), `api.groups.list`, `api.practices.listForGroup` + `CompletePracticeDialog` (Task 8).
- Produces: no new exports; the page's roll-call card becomes local-state driven with bulk save.

Design: per-row buttons update a local `overrides` map instead of calling the server; "Mark all present" fills overrides for every unmarked row; "Save Roll Call" calls `recordBulk` once with the effective statuses (only rows with a status). If a planned practice exists for the selected group + date, a Complete Practice shortcut appears after saving.

- [ ] **Step 1: Rewrite the roll-call section**

In `app/coach/attendance/page.tsx`:

1. Replace imports: add `useEffect`, `Select` components, `api.groups.list`, `api.attendance.recordBulk`, `api.practices.listForGroup`, `CompletePracticeDialog`; drop the `api.attendance.record` mutation import.

```tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { AttendanceCalendar } from "@/components/shared/attendance-calendar";
import { CompletePracticeDialog } from "@/components/coach/complete-practice-dialog";
import { ExportAttendanceDialog } from "@/components/coach/export-attendance-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, formatDate, todayDateString } from "@/lib/format";
```

2. Replace the component body's state + queries + `setAttendance` (keep `statusButtons`, `buttonStyles`, `chipStyles` at module level):

```tsx
export default function CoachAttendancePage() {
  const [date, setDate] = useState(todayDateString());
  const [month, setMonth] = useState(() => todayDateString().slice(0, 7));
  const [groupFilter, setGroupFilter] = useState("all");
  const [overrides, setOverrides] = useState<
    Record<string, "present" | "late" | "absent">
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
  const monthSummary = useQuery(api.attendance.monthSummary, { month });
  const rollCall = useQuery(api.attendance.rollCall, {
    date,
    groupId:
      groupFilter === "all"
        ? undefined
        : groupFilter === "unassigned"
          ? null
          : (groupFilter as never),
  });
  const recordBulk = useMutation(api.attendance.recordBulk);
  const dayPractices = useQuery(
    api.practices.listForGroup,
    groupFilter !== "all" && groupFilter !== "unassigned"
      ? {
          groupId: groupFilter as never,
          fromDate: date,
          toDate: date,
        }
      : "skip",
  );

  useEffect(() => {
    setOverrides({});
    setError(null);
  }, [date, groupFilter]);

  const rows = (rollCall ?? []).map((row) => ({
    ...row,
    status: overrides[row.studentId] ?? row.status,
  }));

  const counts = useMemo(() => {
    const result = { present: 0, late: 0, absent: 0, unmarked: 0 };
    for (const row of rows) {
      if (row.status === null) result.unmarked += 1;
      else result[row.status] += 1;
    }
    return result;
  }, [rows]);

  const plannedPractice =
    dayPractices !== undefined
      ? (dayPractices.find((p) => p.status === "planned") ?? null)
      : null;

  function setStatus(studentId: string, status: "present" | "late" | "absent") {
    setOverrides((prev) => ({ ...prev, [studentId]: status }));
  }

  function markAllPresent() {
    const next: Record<string, "present" | "late" | "absent"> = {};
    for (const row of rollCall ?? []) {
      if ((overrides[row.studentId] ?? row.status) === null) {
        next[row.studentId] = "present";
      }
    }
    setOverrides((prev) => ({ ...prev, ...next }));
  }

  async function saveRollCall() {
    if (saving) return;
    setError(null);
    const entries = rows
      .filter((row) => row.status !== null)
      .map((row) => ({
        studentId: row.studentId as never,
        status: row.status as "present" | "late" | "absent",
      }));
    if (entries.length === 0) {
      setError("Mark at least one swimmer before saving.");
      return;
    }
    setSaving(true);
    try {
      const result = await recordBulk({ date, entries });
      toast.success(`Roll call saved for ${result.recorded} swimmers.`);
      setOverrides({});
      setSaving(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save attendance. Please try again."),
      );
      setSaving(false);
    }
  }
```

3. In the roll-call card header row, add the group Select next to the date heading, plus action buttons:

```tsx
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{formatDate(date)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger
                    className="w-40"
                    aria-label="Filter roll call by group"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {activeGroups.map((group) => (
                      <SelectItem key={group.groupId} value={group.groupId}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
```

4. Above the swimmer list (after the error paragraph), add the bulk action bar:

```tsx
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={markAllPresent}
                disabled={saving || rollCall === undefined}
              >
                Mark all present
              </Button>
              <Button
                size="sm"
                onClick={() => void saveRollCall()}
                disabled={
                  saving || rollCall === undefined || Object.keys(overrides).length === 0
                }
              >
                {saving ? "Saving…" : "Save Roll Call"}
              </Button>
              {plannedPractice ? (
                <CompletePracticeDialog
                  practice={plannedPractice}
                  triggerLabel="Complete Practice"
                />
              ) : null}
            </div>
```

5. In the per-row buttons, replace `disabled={savingFor !== null}` with `disabled={saving}` and the `onClick` with:

```tsx
                            onClick={() =>
                              setStatus(row.studentId, button.value)
                            }
```

(remove the old `setAttendance` handler and `savingFor` state entirely).

- [ ] **Step 2: Verify gates**

```bash
npm run typecheck
npm run lint
npm test
```

- [ ] **Step 3: Manual smoke test**

Coach: pick date + group → Mark all present → tweak one swimmer to Absent → Save Roll Call (one toast, all rows update). If a practice is scheduled for that group/date, "Complete Practice" appears; completing it logs sessions for attendees only (verify on swimmer profiles).

- [ ] **Step 4: Commit**

```bash
git add app/coach/attendance/page.tsx
git commit -m "feat: bulk roll call UI with group filter and practice completion shortcut"
```

---

### Task 11: Seed demo data, README, final gates

**Files:**
- Modify: `convex/seed.ts` (demo groups + profiles + practices; resetDemo cleanup)
- Modify: `README.md` (new features + testing)

**Interfaces:**
- Consumes: all Phase 1 tables.
- Produces: `seed:seed` now also creates groups `Development` + `Competitive`, assigns demo swimmers (Alex + Maria → Competitive, Daniel → Development), sets DOB/sex/joinedAt, and inserts 2 completed + 2 planned demo practices. `seed:resetDemo` also removes those demo groups and their practices.

- [ ] **Step 1: Extend DEMO_STUDENTS**

In `convex/seed.ts`, add to each entry in `DEMO_STUDENTS` (top of each object):

```ts
    group: "Competitive", // "Development" for Daniel Cruz
    dateOfBirth: "2011-05-14", // Maria: "2010-11-02", Daniel: "2013-03-27"
    sex: "M", // Maria: "F"
```

Add a constant above `DEMO_STUDENTS`:

```ts
const JOINED_AT_DAYS_AGO = 90;
```

- [ ] **Step 2: Add demo practices data**

Add below `DEMO_STUDENTS`:

```ts
type DemoPractice = {
  groupName: string;
  daysOffset: number; // negative = past
  title: string;
  startTime: string;
  plannedDurationMinutes: number;
  plannedDistanceMeters: number;
  strokes: string[];
  notes: string;
  status: "planned" | "completed";
};

// Dates chosen so both Competitive swimmers were present on the
// completed practice days (daysAgo 12 and 5 in their demo days).
const DEMO_PRACTICES: DemoPractice[] = [
  {
    groupName: "Competitive",
    daysOffset: -12,
    title: "IM Prep",
    startTime: "17:30",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3000,
    strokes: ["freestyle", "backstroke", "breaststroke", "butterfly"],
    notes: "Transition work between strokes.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: -5,
    title: "Endurance Set",
    startTime: "18:00",
    plannedDurationMinutes: 75,
    plannedDistanceMeters: 2800,
    strokes: ["freestyle", "breaststroke"],
    notes: "4x200m negative split.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: 1,
    title: "Sprint Fundamentals",
    startTime: "17:30",
    plannedDurationMinutes: 60,
    plannedDistanceMeters: 2000,
    strokes: ["freestyle"],
    notes: "8x50 all-out on 2:30.",
    status: "planned",
  },
  {
    groupName: "Development",
    daysOffset: 2,
    title: "Water Comfort & Kicks",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 800,
    strokes: ["freestyle", "breaststroke"],
    notes: "Kickboard drills and breathing rhythm.",
    status: "planned",
  },
];
```

- [ ] **Step 3: Wire groups + profiles + practices into seed**

In `seed.ts`:

1. Add an internal mutation to create groups:

```ts
export const upsertDemoGroups = internalMutation({
  args: {},
  returns: v.object({
    competitiveId: v.id("groups"),
    developmentId: v.id("groups"),
  }),
  handler: async (ctx) => {
    async function upsert(name: string): Promise<Id<"groups">> {
      const groups = await ctx.db
        .query("groups")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(500);
      const existing = groups.find(
        (g) => g.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing._id;
      return ctx.db.insert("groups", {
        name,
        status: "active",
        updatedAt: Date.now(),
      });
    }
    return {
      competitiveId: await upsert("Competitive"),
      developmentId: await upsert("Development"),
    };
  },
});
```

2. In `seed`, after `await ctx.runMutation(internal.skills.backfill, {});` add:

```ts
    const groupIds = await ctx.runMutation(internal.seed.upsertDemoGroups, {});
```

3. In the `createProfile` call inside the per-student loop, extend the args:

```ts
      const studentId: Id<"students"> = await ctx.runMutation(
        internal.students.createProfile,
        {
          userId: created.user._id,
          status: "active",
          groupId:
            demo.group === "Development"
              ? groupIds.developmentId
              : groupIds.competitiveId,
          dateOfBirth: demo.dateOfBirth,
          sex: demo.sex,
          joinedAt: dateStringFromOffset(JOINED_AT_DAYS_AGO),
        },
      );
```

4. Add an internal mutation that inserts the demo practices (actions have no `ctx.db` — all writes go through internal mutations):

```ts
export const addDemoPractices = internalMutation({
  args: {
    practices: v.array(
      v.object({
        groupId: v.id("groups"),
        date: v.string(),
        startTime: v.string(),
        title: v.string(),
        plannedDurationMinutes: v.number(),
        plannedDistanceMeters: v.number(),
        strokes: v.array(v.string()),
        notes: v.string(),
        status: v.union(v.literal("planned"), v.literal("completed")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const practice of args.practices) {
      const endOfDay = Date.parse(`${practice.date}T17:00:00Z`);
      await ctx.db.insert("practices", {
        ...practice,
        ...(practice.status === "completed"
          ? {
              completedAt: endOfDay,
              actualDurationMinutes: practice.plannedDurationMinutes,
              actualDistanceMeters: practice.plannedDistanceMeters,
            }
          : {}),
        updatedAt: endOfDay,
      });
    }
    return null;
  },
});
```

5. In `seed`, after the per-student loop and before `return`, call it:

```ts
    await ctx.runMutation(internal.seed.addDemoPractices, {
      practices: DEMO_PRACTICES.map((practice) => ({
        groupId:
          practice.groupName === "Development"
            ? groupIds.developmentId
            : groupIds.competitiveId,
        date: dateStringFromOffset(-practice.daysOffset),
        startTime: practice.startTime,
        title: practice.title,
        plannedDurationMinutes: practice.plannedDurationMinutes,
        plannedDistanceMeters: practice.plannedDistanceMeters,
        strokes: practice.strokes,
        notes: practice.notes,
        status: practice.status,
      })),
    });
```

6. Extend `resetDemo`: before the per-email loop add a cleanup mutation call:

```ts
    await ctx.runMutation(internal.seed.deleteDemoGroupsAndPractices, {});
```

and add the internal mutation:

```ts
/**
 * Internal: removes the demo groups ("Competitive"/"Development") and
 * every practice scheduled for them. Manually created groups and
 * practices for other groups are untouched.
 */
export const deleteDemoGroupsAndPractices = internalMutation({
  args: {},
  returns: v.object({ removedPractices: v.number(), removedGroups: v.number() }),
  handler: async (ctx) => {
    const groups = await ctx.db.query("groups").take(500);
    const demoNames = new Set(["competitive", "development"]);
    const demoGroups = groups.filter((g) =>
      demoNames.has(g.name.trim().toLowerCase()),
    );
    let removedPractices = 0;
    for (const group of demoGroups) {
      const practices = await ctx.db
        .query("practices")
        .withIndex("by_group_and_date", (q) => q.eq("groupId", group._id))
        .take(1000);
      for (const practice of practices) {
        await ctx.db.delete("practices", practice._id);
        removedPractices += 1;
      }
      await ctx.db.delete("groups", group._id);
    }
    return { removedPractices, removedGroups: demoGroups.length };
  },
});
```

- [ ] **Step 4: Update the README**

In `README.md`:

1. Update the intro feature list to mention training groups, practice planning with one-click session fan-out, bulk roll call, and swimmer profiles.
2. Update the `convex/` architecture tree with `groups.ts` and `practices.ts`.
3. Extend the Domain rules section with:
   - **Practices**: completing a practice logs a training session for every active group member who was not marked absent that day; re-completing updates those sessions.
   - **Commitment**: attendance ÷ completed group practices since the swimmer's join date, shown alongside the legacy all-records attendance %.
4. Add a Testing section after Demo data:

```markdown
### Tests

Convex function tests run with vitest + convex-test:

```bash
npm test
```
```

- [ ] **Step 5: Run full gates**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all clean.

- [ ] **Step 6: Manual end-to-end verification with seed**

```bash
npx convex run seed:resetDemo
npx convex run seed:seed
```

Then as coach verify: Groups page shows Competitive (2 members) + Development (1); Practices page shows the planned sessions; a Competitive swimmer's detail shows Commitment 100% (2 of 2); Mark all present + Save Roll Call + Complete Practice works end to end.

- [ ] **Step 7: Commit**

```bash
git add convex/seed.ts README.md
git commit -m "feat: seed demo groups and practices with Phase 1 feature docs"
```

---

### Task 12: M7 — distance & intensity on manual sessions

**Files:**
- Modify: `convex/training.ts` (`sessionFields`, `sessionRecord`, `validateSessionFields`, `create`, `update`, list mappings)
- Modify: `components/coach/session-form-dialog.tsx` (distance input + intensity select)
- Modify: `app/coach/students/[id]/page.tsx` (edit-dialog initial gains distance/intensity)
- Create: `convex/training-metrics.test.ts`

**Interfaces:**
- Consumes: Task 6 schema fields (`distanceMeters`, `intensity`) and `assertDistanceMeters`.
- Produces: `api.training.create`/`update` accept optional `distanceMeters` (1–30000) and `intensity` (`"easy" | "moderate" | "hard"`); all session list queries (`listForStudent`, `mySessions`, `listRecent`) return `distanceMeters: number | null` and `intensity: "easy" | "moderate" | "hard" | null`. Note: `weeklyVolumeMeters` in `lib/stats.ts` is deferred to Phase 3 (its first consumer is M8/S1).

- [ ] **Step 1: Write failing tests**

Create `convex/training-metrics.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

async function setup() {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  await t.run(async (ctx) => {
    await ctx.db.insert("skills", {
      key: "freestyle",
      name: "Freestyle",
      status: "active",
      updatedAt: Date.now(),
    });
  });
  const { studentId } = await seedStudent(t, "Alex Santos");
  return { t, asCoach, studentId };
}

test("coach records distance and intensity on a manual session", async () => {
  const { asCoach, studentId } = await setup();
  await asCoach.mutation(api.training.create, {
    studentId: studentId as never,
    date: "2026-09-10",
    title: "Long swim",
    durationMinutes: 60,
    distanceMeters: 2500,
    intensity: "moderate",
    strokes: ["freestyle"],
  });
  const sessions = await asCoach.query(api.training.listForStudent, {
    studentId: studentId as never,
  });
  expect(sessions[0]).toMatchObject({
    distanceMeters: 2500,
    intensity: "moderate",
  });
});

test("invalid distance and intensity are rejected", async () => {
  const { asCoach, studentId } = await setup();
  await expect(
    asCoach.mutation(api.training.create, {
      studentId: studentId as never,
      date: "2026-09-10",
      title: "Bad distance",
      durationMinutes: 60,
      distanceMeters: 50000,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Distance must be between 1 and 30000 meters");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `distanceMeters`/`intensity` not accepted by `create`.

- [ ] **Step 3: Extend convex/training.ts**

1. Import `assertDistanceMeters` (add to the existing `./lib/validation` import).
2. Replace `sessionFields` and `sessionRecord`:

```ts
const sessionFields = {
  date: v.string(),
  title: v.string(),
  durationMinutes: v.number(),
  distanceMeters: v.optional(v.number()),
  intensity: v.optional(
    v.union(v.literal("easy"), v.literal("moderate"), v.literal("hard")),
  ),
  strokes: v.array(v.string()),
  notes: v.optional(v.string()),
};

const sessionRecord = v.object({
  _id: v.id("trainingSessions"),
  studentId: v.id("students"),
  date: v.string(),
  title: v.string(),
  durationMinutes: v.number(),
  distanceMeters: v.union(v.number(), v.null()),
  intensity: v.union(
    v.literal("easy"),
    v.literal("moderate"),
    v.literal("hard"),
    v.null(),
  ),
  strokes: v.array(v.string()),
  notes: v.union(v.string(), v.null()),
});
```

3. In `validateSessionFields`, add validation and include the fields in the return object:

```ts
  if (args.distanceMeters !== undefined) {
    assertDistanceMeters(args.distanceMeters);
  }
```

and add to the returned object:

```ts
    distanceMeters: args.distanceMeters,
    intensity: args.intensity,
```

4. In each of `listForStudent`, `mySessions`, and `listRecent`, add these two lines to the session mapping object (`sessions.map((s) => ({ ... }))`):

```ts
      distanceMeters: s.distanceMeters ?? null,
      intensity: s.intensity ?? null,
```

(`create` and `update` already spread the validated fields into the insert/patch — no other change needed.)

- [ ] **Step 4: Extend the session form dialog**

In `components/coach/session-form-dialog.tsx`:

1. Extend `SessionFormValues` and the initial state:

```ts
export type SessionFormValues = {
  studentId: string;
  date: string;
  title: string;
  durationMinutes: string;
  distanceMeters: string;
  intensity: string;
  strokes: string[];
  notes: string;
};
```

with `distanceMeters: initial?.distanceMeters ?? ""` and `intensity: initial?.intensity ?? "unset"` in the `useState` initializer.
2. Extend `args` in `handleSubmit` (before `notes`):

```tsx
      ...(parsed.data.distanceMeters !== ""
        ? { distanceMeters: Number(parsed.data.distanceMeters) }
        : {}),
      ...(form.intensity !== "unset"
        ? { intensity: form.intensity as "easy" | "moderate" | "hard" }
        : {}),
```

3. Add the fields after the Duration input (inside the same `grid`, making it three columns via `sm:grid-cols-3`, or a new row):

```tsx
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-distance">Distance (m, optional)</Label>
              <Input
                id="session-distance"
                type="number"
                min={1}
                max={30000}
                value={form.distanceMeters}
                onChange={(e) => update("distanceMeters", e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="session-intensity">Intensity (optional)</Label>
            <Select
              value={form.intensity}
              onValueChange={(value) => update("intensity", value)}
              disabled={submitting}
            >
              <SelectTrigger id="session-intensity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
```

(Adjust the surrounding `grid` divs so the Date/Duration/Distance row reads `sm:grid-cols-3` and the closing tags balance.)

- [ ] **Step 5: Pass current values when editing**

In `app/coach/students/[id]/page.tsx`, extend the edit-mode `SessionFormDialog` initial object:

```tsx
                      initial={{
                        studentId: student.studentId,
                        date: session.date,
                        title: session.title,
                        durationMinutes: String(session.durationMinutes),
                        distanceMeters:
                          session.distanceMeters === null
                            ? ""
                            : String(session.distanceMeters),
                        intensity: session.intensity ?? "unset",
                        strokes: session.strokes,
                        notes: session.notes ?? "",
                      }}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test
```

- [ ] **Step 7: Verify gates**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add convex/training.ts components/coach/session-form-dialog.tsx "app/coach/students/[id]/page.tsx" convex/training-metrics.test.ts
git commit -m "feat: distance and intensity metrics on training sessions"
```

---

## Execution Notes

- Tasks must run in order — each consumes the previous task's interfaces. (Task 12 only depends on Task 6's schema and could be done any time after it.)
- Every task ends green on `npm run typecheck`, `npm run lint`, and `npm test` before its commit.
- `npx convex dev` should be running for manual smoke tests; schema changes push automatically.
- If `convex-test` API details differ from what Task 1 assumes (e.g. `withIdentity`/`run` signatures), fix the helpers in Task 1 before proceeding — every later test depends on them.
