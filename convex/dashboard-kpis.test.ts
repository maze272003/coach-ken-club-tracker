// convex/dashboard-kpis.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { datePlusDays, todayInCoachTz } from "./lib/time";

// Local helpers mirroring lib/time so the test file is self-contained.
function offset(date: string, days: number): string {
  return new Date(
    new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
}

function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return offset(date, -((dow + 6) % 7));
}

describe("coachOverview v2 KPIs", () => {
  it("computes weekly volume deltas and PBs this month", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Alex Santos");
    const today = todayInCoachTz();

    await t.run(async (ctx) => {
      // This week: 1500m; last week: 1000m
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: today,
        title: "AM",
        durationMinutes: 60,
        distanceMeters: 1500,
        strokes: [],
        updatedAt: Date.now(),
      });
      const mondayThisWeek = weekStart(today);
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: offset(mondayThisWeek, -3),
        title: "PM",
        durationMinutes: 60,
        distanceMeters: 1000,
        strokes: [],
        updatedAt: Date.now(),
      });
      // A PB this month: improves on a >1-month-old result.
      await ctx.db.insert("timeResults", {
        studentId,
        date: datePlusDays(today, -35),
        distanceMeters: 50,
        stroke: "freestyle",
        course: "short",
        timeMs: 31000,
        context: "practice",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeResults", {
        studentId,
        date: datePlusDays(today, -3),
        distanceMeters: 50,
        stroke: "freestyle",
        course: "short",
        timeMs: 30000,
        context: "time_trial",
        updatedAt: Date.now(),
      });
    });

    const overview = await t
      .withIdentity({ subject: coachId })
      .query(api.dashboard.coachOverview, {});

    expect(overview.stats.pbsThisMonth).toBe(1);
    expect(overview.kpis.volumeThisWeek).toBe(1500);
    expect(overview.kpis.volumeLastWeek).toBe(1000);
    expect(Array.isArray(overview.goalDeadlines)).toBe(true);
  });

  it("rejects non-coach callers", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedStudent(t, "Maria Reyes");
    await expect(
      t.withIdentity({ subject: userId }).query(api.dashboard.coachOverview, {}),
    ).rejects.toThrow("Not authorized");
  });
});
