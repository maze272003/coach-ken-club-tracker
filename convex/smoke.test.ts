/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

test("coach identity passes requireCoach and sees students", async () => {
  const t = convexTest(schema, modules);
  await seedStudent(t, "Alex Santos");
  const coachId = await seedCoach(t);
  const students = await t
    .withIdentity({ subject: coachId })
    .query(api.students.list, { search: "alex" });
  expect(students).toHaveLength(1);
  expect(students[0]).toMatchObject({ name: "Alex Santos" });
});

test("student identity is rejected by coach-only queries", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedStudent(t, "Maria Reyes");
  await expect(
    t.withIdentity({ subject: userId }).query(api.students.list, {}),
  ).rejects.toThrowError("Not authorized");
});

test("anonymous callers are rejected by coach-only queries", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.students.list, {})).rejects.toThrowError(
    "Not authorized",
  );
});
