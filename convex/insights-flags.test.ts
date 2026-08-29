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
