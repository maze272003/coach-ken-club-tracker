/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

async function setup() {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  await t.run(async (ctx) => {
    await ctx.db.insert("skills", {
      key: "freestyle",
      name: "Freestyle",
      status: "active",
      updatedAt: Date.now(),
    });
  });
  const { studentId } = await seedStudent(t, "Alex Santos");
  return { t, asCoach, studentId };
}

test("coach records distance and intensity on a manual session", async () => {
  const { asCoach, studentId } = await setup();
  await asCoach.mutation(api.training.create, {
    studentId: studentId as never,
    date: "2026-09-10",
    title: "Long swim",
    durationMinutes: 60,
    distanceMeters: 2500,
    intensity: "moderate",
    strokes: ["freestyle"],
  });
  const sessions = await asCoach.query(api.training.listForStudent, {
    studentId: studentId as never,
  });
  expect(sessions[0]).toMatchObject({
    distanceMeters: 2500,
    intensity: "moderate",
  });
});

test("invalid distance and intensity are rejected", async () => {
  const { asCoach, studentId } = await setup();
  await expect(
    asCoach.mutation(api.training.create, {
      studentId: studentId as never,
      date: "2026-09-10",
      title: "Bad distance",
      durationMinutes: 60,
      distanceMeters: 50000,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Distance must be between 1 and 30000 meters");
});
