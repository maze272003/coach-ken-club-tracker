/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";

describe("Time Results Export", () => {
  it("returns enriched records with formatted times and student names for export", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const { studentId } = await seedStudent(t, "David");

    await t.withIdentity({ subject: coachId }).mutation(api.times.create, {
      studentId,
      date: "2026-08-15",
      stroke: "butterfly",
      distanceMeters: 100,
      course: "long",
      timeMs: 62500,
      context: "meet",
    });

    const exportData = await t.withIdentity({ subject: coachId }).query(api.times.exportTimes, {
      stroke: "butterfly",
    });

    expect(exportData.records).toHaveLength(1);
    expect(exportData.records[0].studentName).toBe("David");
    expect(exportData.records[0].formattedTime).toBe("1:02.50");
    expect(exportData.records[0].course).toBe("long");
    expect(exportData.records[0].stroke).toBe("butterfly");
    expect(exportData.records[0].distanceMeters).toBe(100);
  });
});
