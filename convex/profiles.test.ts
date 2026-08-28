/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

const DOB = "2011-05-14";

test("coach updates a full swimmer profile and reads it back", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { studentId } = await seedStudent(t, "Alex Santos");
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });

  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    dateOfBirth: DOB,
    sex: "M",
    parentName: "Ana Santos",
    parentPhone: "+1 555 0100",
    parentEmail: "ana@example.com",
    joinedAt: "2026-01-15",
    medicalNotes: "Mild asthma; carries inhaler.",
    groupId,
  });

  const detail = await asCoach.query(api.students.get, {
    studentId: studentId as never,
  });
  expect(detail).toMatchObject({
    dateOfBirth: DOB,
    sex: "M",
    parentName: "Ana Santos",
    parentEmail: "ana@example.com",
    medicalNotes: "Mild asthma; carries inhaler.",
    groupName: "Competitive",
  });
});

test("date of birth in the future is rejected", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { studentId } = await seedStudent(t, "Maria Reyes");
  await expect(
    asCoach.mutation(api.students.update, {
      studentId: studentId as never,
      dateOfBirth: "2030-01-01",
    }),
  ).rejects.toThrowError("Date of birth must be at least 3 years in the past");
});

test("myProfile never exposes medical notes", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { userId, studentId } = await seedStudent(t, "Daniel Cruz");
  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    dateOfBirth: DOB,
    medicalNotes: "Private coach note",
  });

  const profile = await t
    .withIdentity({ subject: userId })
    .query(api.students.myProfile, {});
  expect(profile).toMatchObject({ dateOfBirth: DOB });
  expect(JSON.stringify(profile)).not.toContain("medicalNotes");
  expect(JSON.stringify(profile)).not.toContain("Private coach note");
});

test("update with groupId null clears the group", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Development",
  });
  const { studentId } = await seedStudent(t, "Daniel Cruz");
  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    groupId,
  });
  await asCoach.mutation(api.students.update, {
    studentId: studentId as never,
    groupId: null,
  });
  const students = await asCoach.query(api.students.list, { groupId: null });
  expect(students.map((s) => s.name)).toContain("Daniel Cruz");
});
