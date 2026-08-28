/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

test("coach creates a group and sees it listed with member count", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
    description: "Race squad",
  });
  const { studentId } = await seedStudent(t, "Alex Santos");
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId });

  const groups = await asCoach.query(api.groups.list, {});
  expect(groups).toMatchObject([
    { name: "Competitive", description: "Race squad", status: "active", memberCount: 1 },
  ]);
});

test("duplicate active group names are rejected (case-insensitive)", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  await asCoach.mutation(api.groups.create, { name: "Juniors" });
  await expect(
    asCoach.mutation(api.groups.create, { name: "juniors" }),
  ).rejects.toThrowError("An active group with this name already exists");
});

test("archived group names can be reused; archived groups keep members", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, { name: "Juniors" });
  const { studentId } = await seedStudent(t, "Daniel Cruz");
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId });
  await asCoach.mutation(api.groups.setStatus, { groupId, status: "archived" });

  const again = await asCoach.mutation(api.groups.create, { name: "Juniors" });
  expect(again.groupId).toBeTruthy();

  const groups = await asCoach.query(api.groups.list, {});
  const archived = groups.find((g) => g.status === "archived");
  expect(archived).toMatchObject({ name: "Juniors", memberCount: 1 });
});

test("assignStudent rejects unknown group and clears with null", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, { name: "Development" });
  const { studentId } = await seedStudent(t, "Maria Reyes");
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId });
  await asCoach.mutation(api.groups.assignStudent, { studentId, groupId: null });

  const students = await asCoach.query(api.students.list, { groupId: null });
  expect(students).toMatchObject([{ name: "Maria Reyes", groupName: null }]);
});

test("students.list filters by group and exposes groupName", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, { name: "Competitive" });
  const alex = await seedStudent(t, "Alex Santos");
  await seedStudent(t, "Maria Reyes");
  await asCoach.mutation(api.groups.assignStudent, {
    studentId: alex.studentId,
    groupId,
  });

  const inGroup = await asCoach.query(api.students.list, { groupId });
  expect(inGroup.map((s) => s.name)).toEqual(["Alex Santos"]);
  expect(inGroup[0]).toMatchObject({ groupName: "Competitive" });

  const unassigned = await asCoach.query(api.students.list, { groupId: null });
  expect(unassigned.map((s) => s.name)).toEqual(["Maria Reyes"]);
});

test("students cannot create groups", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedStudent(t, "Alex Santos");
  await expect(
    t.withIdentity({ subject: userId }).mutation(api.groups.create, { name: "Hax" }),
  ).rejects.toThrowError("Not authorized");
});
