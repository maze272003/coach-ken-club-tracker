// convex/reports-card.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("reports.athleteCard", () => {
  it("rejects students and anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const { userId, studentId } = await seedStudent(t, "Alex Santos");
    await expect(
      t.withIdentity({ subject: userId }).query(api.reports.athleteCard, {
        studentId,
      }),
    ).rejects.toThrow("Not authorized");
  });

  it("returns the full card for a swimmer with history", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Maria Reyes");

    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "Senior A",
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.patch("students", studentId, { groupId, joinedAt: "2026-01-15" });
      await ctx.db.insert("timeResults", {
        studentId,
        date: "2026-08-10",
        distanceMeters: 50,
        stroke: "freestyle",
        course: "short",
        timeMs: 29500,
        context: "meet",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("strokeSkills", {
        studentId,
        stroke: "freestyle",
        progress: 72,
        updatedAt: Date.now(),
      });
    });

    const card = await t
      .withIdentity({ subject: coachId })
      .query(api.reports.athleteCard, { studentId });

    expect(card.student.name).toBe("Maria Reyes");
    expect(card.groupName).toBe("Senior A");
    expect(card.pbs).toHaveLength(1);
    expect(card.pbs[0]!.bestTimeMs).toBe(29500);
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]!.progress).toBe(72);
    expect(card.volumeByWeek).toHaveLength(12);
    expect(card.commitment).not.toBeNull();
  });
});
