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
    const { userId, studentId } = await seedStudent(t, "Alex Santos");
    await expect(
      t.withIdentity({ subject: userId }).query(api.insights.studentTrends, {
        studentId,
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
