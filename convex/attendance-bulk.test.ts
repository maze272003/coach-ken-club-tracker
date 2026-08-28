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

  // Convex's id validator rejects this syntactically invalid id before
  // the handler runs — either guard satisfies "unknown students rejected"
  // (see plan note). A valid-but-nonexistent id hits "Student not found".
  await expect(
    asCoach.mutation(api.attendance.recordBulk, {
      date: DATE,
      entries: [
        { studentId: "k57hqz8q2vbt3a7v8eyhk15h6e6" as never, status: "present" },
      ],
    }),
  ).rejects.toThrowError(/Expected ID for table "students"|Student not found/);

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
