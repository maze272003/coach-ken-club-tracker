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
