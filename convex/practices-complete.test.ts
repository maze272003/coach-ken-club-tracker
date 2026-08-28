/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

const DATE = "2026-09-10";

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
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });
  const alex = await seedStudent(t, "Alex Santos");
  const maria = await seedStudent(t, "Maria Reyes");
  const daniel = await seedStudent(t, "Daniel Cruz");
  for (const s of [alex, maria, daniel]) {
    await asCoach.mutation(api.groups.assignStudent, {
      studentId: s.studentId,
      groupId,
    });
  }
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: DATE,
    title: "Aerobic base",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3000,
    strokes: ["freestyle"],
    notes: "4x200 free",
  });
  return { t, asCoach, groupId, practiceId, alex, maria, daniel };
}

test("complete fans out sessions to attendees, skips absent members", async () => {
  const { t, asCoach, practiceId, alex, maria, daniel } = await setup();
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: DATE,
    status: "present",
  });
  await asCoach.mutation(api.attendance.record, {
    studentId: maria.studentId as never,
    date: DATE,
    status: "absent",
  });

  const result = await asCoach.mutation(api.practices.complete, {
    practiceId,
    actualDurationMinutes: 85,
  });
  expect(result).toMatchObject({
    sessionsCreated: 2,
    sessionsUpdated: 0,
    sessionsSkipped: 1,
  });

  const alexSessions = await asCoach.query(api.training.listForStudent, {
    studentId: alex.studentId as never,
  });
  expect(alexSessions).toMatchObject([
    {
      title: "Aerobic base",
      durationMinutes: 85,
      strokes: ["freestyle"],
    },
  ]);
  // distanceMeters/practiceId are verified directly in the DB (they are
  // exposed through listForStudent in Task 12).
  const alexDoc = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_practice", (q) =>
        q.eq("studentId", alex.studentId as never).eq("practiceId", practiceId),
      )
      .take(1);
    return rows[0];
  });
  expect(alexDoc).toMatchObject({ distanceMeters: 3000 });

  const mariaSessions = await asCoach.query(api.training.listForStudent, {
    studentId: maria.studentId as never,
  });
  expect(mariaSessions).toHaveLength(0);

  const danielSessions = await asCoach.query(api.training.listForStudent, {
    studentId: daniel.studentId as never,
  });
  expect(danielSessions).toHaveLength(1);
});

test("re-completing patches sessions instead of duplicating them", async () => {
  const { t, asCoach, practiceId, alex } = await setup();
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: DATE,
    status: "present",
  });
  await asCoach.mutation(api.practices.complete, { practiceId });
  const second = await asCoach.mutation(api.practices.complete, {
    practiceId,
    actualDurationMinutes: 70,
    actualDistanceMeters: 2500,
  });
  expect(second).toMatchObject({
    sessionsCreated: 0,
    sessionsUpdated: 3,
    sessionsSkipped: 0,
  });
  const sessions = await asCoach.query(api.training.listForStudent, {
    studentId: alex.studentId as never,
  });
  expect(sessions).toHaveLength(1);
  const alexDoc = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("trainingSessions")
      .withIndex("by_student_and_practice", (q) =>
        q.eq("studentId", alex.studentId as never).eq("practiceId", practiceId),
      )
      .take(1);
    return rows[0];
  });
  expect(alexDoc).toMatchObject({ durationMinutes: 70, distanceMeters: 2500 });
});

test("commitment percentage = attended / completed group practices since join", async () => {
  const { asCoach, groupId, practiceId, alex } = await setup();
  const { practiceId: p2 } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-12",
    title: "Second",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.students.update, {
    studentId: alex.studentId as never,
    joinedAt: "2026-09-01",
  });
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: DATE,
    status: "present",
  });
  await asCoach.mutation(api.attendance.record, {
    studentId: alex.studentId as never,
    date: "2026-09-12",
    status: "absent",
  });
  await asCoach.mutation(api.practices.complete, { practiceId });
  await asCoach.mutation(api.practices.complete, { practiceId: p2 });

  const detail = await asCoach.query(api.students.get, {
    studentId: alex.studentId as never,
  });
  expect(detail?.commitment).toMatchObject({
    held: 2,
    attended: 1,
    percentage: 50,
  });
});

test("commitment is null for students without a group", async () => {
  const { t, asCoach } = await setup();
  const loner = await seedStudent(t, "Solo Swimmer");
  const detail = await asCoach.query(api.students.get, {
    studentId: loner.studentId as never,
  });
  expect(detail?.commitment).toBeNull();
});
