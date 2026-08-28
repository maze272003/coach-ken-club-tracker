/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("Time Results CRUD & Access Control", () => {
  it("allows coach to record, list, and remove time results", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Alex Santos");

    // 1. Coach creates time result
    const res = await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-20",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 28450,
      context: "practice",
      notes: "Clean turn",
    });
    expect(res.isNewPersonalBest).toBe(true);

    // 2. List times for student
    const history = await t
      .withIdentity({ subject: coachId })
      .query(api.times.listForStudent, { studentId });
    expect(history).toHaveLength(1);
    expect(history[0].timeMs).toBe(28450);
    expect(history[0].isPersonalBest).toBe(true);
    expect(history[0].notes).toBe("Clean turn");

    // 3. Remove time result
    await t
      .withIdentity({ subject: coachId })
      .mutation(api.times.remove, { id: history[0]._id });

    const updatedHistory = await t
      .withIdentity({ subject: coachId })
      .query(api.times.listForStudent, { studentId });
    expect(updatedHistory).toHaveLength(0);
  });

  it("blocks student from creating or deleting time results", async () => {
    const t = convexTest(schema, modules);
    const { userId, studentId } = await seedStudent(t, "Maria Reyes");

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.times.create, {
        studentId,
        date: "2026-08-20",
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        timeMs: 31000,
        context: "practice",
      }),
    ).rejects.toThrowError("Not authorized");
  });

  it("allows student to query their own personal bests", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { userId, studentId } = await seedStudent(t, "Daniel Cruz");

    await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-15",
      stroke: "backstroke",
      distanceMeters: 100,
      course: "short",
      timeMs: 68500,
      context: "meet",
    });

    const studentPBs = await t
      .withIdentity({ subject: userId })
      .query(api.times.myPersonalBests, {});
    expect(studentPBs).toHaveLength(1);
    expect(studentPBs[0].stroke).toBe("backstroke");
    expect(studentPBs[0].distanceMeters).toBe(100);
    expect(studentPBs[0].course).toBe("short");
    expect(studentPBs[0].timeMs).toBe(68500);
  });
});
