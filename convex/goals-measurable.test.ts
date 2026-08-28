/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("Measurable Goals v2 (Time & Attendance)", () => {
  it("dynamically derives time goal progress and auto-completes when target is reached", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Clara");

    // 1. Initial PB: 32.00s (32000ms)
    await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-01",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 32000,
      context: "practice",
    });

    // 2. Create Time Goal: Break 30.00s (30000ms), baseline captured as 32000ms
    const { goalId } = await t.withIdentity({ subject: coachId }).mutation(api.goals.create, {
      studentId,
      title: "Sub-30 50m Free",
      type: "time",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      targetTimeMs: 30000,
      progress: 0,
      status: "in_progress",
    });
    expect(goalId).toBeDefined();


    // 3. Mid-way swim: 31.00s -> Progress: (32000 - 31000)/(32000 - 30000) = 50%
    await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-10",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 31000,
      context: "practice",
    });

    let goals = await t
      .withIdentity({ subject: coachId })
      .query(api.goals.listForStudent, { studentId });
    expect(goals).toHaveLength(1);
    expect(goals[0].progress).toBe(50);
    expect(goals[0].status).toBe("in_progress");
    expect(goals[0].currentBestMs).toBe(31000);
    expect(goals[0].baselineBestMs).toBe(32000);

    // 4. Winning swim: 29.80s -> Goal auto-completes to 100%!
    await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-20",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 29800,
      context: "meet",
    });

    goals = await t
      .withIdentity({ subject: coachId })
      .query(api.goals.listForStudent, { studentId });
    expect(goals[0].progress).toBe(100);
    expect(goals[0].status).toBe("completed");
    expect(goals[0].currentBestMs).toBe(29800);
  });

  it("dynamically derives attendance goal progress from recorded sessions", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Ethan");

    // Create Attendance Goal: 90% attendance
    await t.withIdentity({ subject: coachId }).mutation(api.goals.create, {
      studentId,
      title: "90% Attendance Streak",
      type: "attendance",
      targetAttendancePct: 90,
      progress: 0,
      status: "in_progress",
    });

    // Record attendance: 3 present, 1 absent -> 75% attendance -> Goal progress: 75/90 = 83%
    await t.withIdentity({ subject: coachId }).mutation(api.attendance.record, {
      studentId,
      date: "2026-08-01",
      status: "present",
    });
    await t.withIdentity({ subject: coachId }).mutation(api.attendance.record, {
      studentId,
      date: "2026-08-02",
      status: "present",
    });
    await t.withIdentity({ subject: coachId }).mutation(api.attendance.record, {
      studentId,
      date: "2026-08-03",
      status: "present",
    });
    await t.withIdentity({ subject: coachId }).mutation(api.attendance.record, {
      studentId,
      date: "2026-08-04",
      status: "absent",
    });

    const goals = await t
      .withIdentity({ subject: coachId })
      .query(api.goals.listForStudent, { studentId });
    expect(goals[0].currentAttendancePct).toBe(75);
    expect(goals[0].progress).toBe(83); // round(75 / 90 * 100)
    expect(goals[0].status).toBe("in_progress");
  });
});
