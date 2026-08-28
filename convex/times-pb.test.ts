/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("Personal Best Detection & Isolation Engine", () => {
  it("tracks PB deltas, prevents ties from being new PBs, and separates SCM and LCM courses", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "Alex Santos");

    // 1. Initial 50m Free SCM (Short Course): 30.00s -> First PB
    const res1 = await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-01",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 30000,
      context: "practice",
    });
    expect(res1.isNewPersonalBest).toBe(true);
    expect(res1.previousBestMs).toBeNull();
    expect(res1.deltaMs).toBeNull();

    // 2. 50m Free LCM (Long Course): 31.00s -> First PB for LCM (independent of SCM!)
    const res2 = await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-03",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "long",
      timeMs: 31000,
      context: "meet",
    });
    expect(res2.isNewPersonalBest).toBe(true);
    expect(res2.previousBestMs).toBeNull(); // LCM baseline

    // 3. Slower SCM swim: 30.50s -> Not a PB
    const res3 = await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-05",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 30500,
      context: "practice",
    });
    expect(res3.isNewPersonalBest).toBe(false);

    // 4. Faster SCM swim: 28.50s -> New PB (-1.50s / -5.0%)
    const res4 = await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-10",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 28500,
      context: "meet",
    });
    expect(res4.isNewPersonalBest).toBe(true);
    expect(res4.previousBestMs).toBe(30000);
    expect(res4.deltaMs).toBe(1500);
    expect(res4.deltaPct).toBe(5);

    // 5. Tie SCM swim: 28.50s -> Tie is NOT a new PB drop
    const res5 = await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-15",
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short",
      timeMs: 28500,
      context: "time_trial",
    });
    expect(res5.isNewPersonalBest).toBe(false);

    // 6. Query all PBs
    const pbs = await t
      .withIdentity({ subject: coachId })
      .query(api.times.getPersonalBests, { studentId });
    expect(pbs).toHaveLength(2); // 50m Free SCM (28.50s) and 50m Free LCM (31.00s)
    const scmPB = pbs.find((p) => p.course === "short");
    const lcmPB = pbs.find((p) => p.course === "long");
    expect(scmPB?.timeMs).toBe(28500);
    expect(lcmPB?.timeMs).toBe(31000);
  });
});
