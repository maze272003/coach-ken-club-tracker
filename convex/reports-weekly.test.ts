// convex/reports-weekly.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";

describe("reports.generateWeekly", () => {
  it("writes one idempotent report covering the completed week", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    const today = todayInCoachTz();
    const weekStart = weekStartIso(datePlusDays(today, -1));
    const { studentId } = await seedStudent(t, "Alex Santos");

    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "Senior A",
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.patch("students", studentId, { groupId });
      await ctx.db.insert("practices", {
        groupId,
        date: datePlusDays(weekStart, 2),
        title: "Aerobic set",
        plannedDurationMinutes: 90,
        strokes: ["freestyle"],
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("attendance", {
        studentId,
        date: datePlusDays(weekStart, 2),
        status: "present",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("trainingSessions", {
        studentId,
        date: datePlusDays(weekStart, 2),
        title: "From practice: Aerobic set",
        durationMinutes: 90,
        distanceMeters: 3200,
        strokes: ["freestyle"],
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.reports.generateWeekly, {});
    await t.mutation(internal.reports.generateWeekly, {});

    const docs = await t.run(async (ctx) => {
      return await ctx.db.query("reports").collect();
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.weekStart).toBe(weekStart);

    const payload = JSON.parse(docs[0]!.payloadJson) as {
      team: { practicesHeld: number; volumeMeters: number };
      groups: Array<{ groupName: string; practicesHeld: number }>;
      errors: unknown[];
    };
    expect(payload.team.practicesHeld).toBe(1);
    expect(payload.team.volumeMeters).toBe(3200);
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0]!.groupName).toBe("Senior A");
    expect(payload.errors).toEqual([]);
  });
});

describe("reports.list", () => {
  it("returns recent weekly reports for coach", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const today = todayInCoachTz();
    const weekStart = weekStartIso(datePlusDays(today, -1));

    await t.run(async (ctx) => {
      await ctx.db.insert("reports", {
        weekStart,
        payloadJson: JSON.stringify({
          weekStart,
          team: { practicesHeld: 0, attendancePct: null, volumeMeters: 0, pbs: 0, flagsRaised: 0 },
          groups: [],
          errors: [],
        }),
        createdAt: Date.now(),
      });
    });

    const res = await t.withIdentity({ subject: coachId }).query(api.reports.list, {});
    expect(res.reports).toHaveLength(1);
    expect(res.reports[0]!._id).toBeDefined();
    expect(res.reports[0]!._creationTime).toBeDefined();
    expect(res.reports[0]!.weekStart).toBe(weekStart);
  });
});

