/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("Bulk Time Trial Recording", () => {
  it("records time trial entries atomically, detects batch PBs, and rejects invalid batches", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);

    const group = await t.run(async (ctx) => {
      return ctx.db.insert("groups", {
        name: "Senior Squad",
        status: "active",
        updatedAt: Date.now(),
      });
    });

    const s1 = await seedStudent(t, "Alice");
    const s2 = await seedStudent(t, "Bob");
    await t.run(async (ctx) => {
      await ctx.db.patch("students", s1.studentId, { groupId: group });
      await ctx.db.patch("students", s2.studentId, { groupId: group });
    });

    // 1. Initial bulk time trial: 50m Free SCM
    const res1 = await t.withIdentity({ subject: coachId }).mutation(api.times.recordBulk, {
      groupId: group,
      date: "2026-08-20",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      context: "time_trial",
      entries: [
        { studentId: s1.studentId, timeMs: 29500, notes: "Good breakout" },
        { studentId: s2.studentId, timeMs: 31200 },
      ],
    });

    expect(res1.recordedCount).toBe(2);
    expect(res1.newPersonalBests).toHaveLength(2);
    expect(res1.newPersonalBests[0].studentName).toBe("Alice");
    expect(res1.newPersonalBests[0].formattedTime).toBe("29.50");

    // 2. Second bulk time trial: Alice improves (28.80s), Bob is slower (32.00s)
    const res2 = await t.withIdentity({ subject: coachId }).mutation(api.times.recordBulk, {
      groupId: group,
      date: "2026-08-27",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      context: "time_trial",
      entries: [
        { studentId: s1.studentId, timeMs: 28800 },
        { studentId: s2.studentId, timeMs: 32000 },
      ],
    });

    expect(res2.recordedCount).toBe(2);
    expect(res2.newPersonalBests).toHaveLength(1);
    expect(res2.newPersonalBests[0].studentName).toBe("Alice");
    expect(res2.newPersonalBests[0].deltaMs).toBe(700);
    expect(res2.newPersonalBests[0].deltaPct).toBe(2.4);

    // 3. Atomicity: invalid entry causes entire batch to roll back
    await expect(
      t.withIdentity({ subject: coachId }).mutation(api.times.recordBulk, {
        groupId: group,
        date: "2026-08-28",
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        context: "time_trial",
        entries: [
          { studentId: s1.studentId, timeMs: 27500 },
          { studentId: s2.studentId, timeMs: -500 }, // Invalid time
        ],
      }),
    ).rejects.toThrow();

    // Verify Alice's PB is still 28.80s (rollback worked)
    const pbs = await t
      .withIdentity({ subject: coachId })
      .query(api.times.getPersonalBests, { studentId: s1.studentId });
    expect(pbs[0].timeMs).toBe(28800);
  });
});
