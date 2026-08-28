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
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });
  return { t, asCoach, groupId };
}

test("coach creates a planned practice and lists it", async () => {
  const { asCoach, groupId } = await setup();
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-15",
    startTime: "17:30",
    title: "Aerobic base",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3200,
    strokes: ["freestyle"],
    notes: "4x200 free on 3:00",
  });
  expect(practiceId).toBeTruthy();

  const list = await asCoach.query(api.practices.listForGroup, {
    groupId,
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
  });
  expect(list).toMatchObject([
    {
      title: "Aerobic base",
      status: "planned",
      groupName: "Competitive",
      startTime: "17:30",
    },
  ]);
});

test("create rejects invalid time, unknown skill, and inactive group", async () => {
  const { asCoach, groupId } = await setup();
  await expect(
    asCoach.mutation(api.practices.create, {
      groupId,
      date: "2026-09-15",
      startTime: "25:00",
      title: "Bad time",
      plannedDurationMinutes: 60,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Invalid time");

  await expect(
    asCoach.mutation(api.practices.create, {
      groupId,
      date: "2026-09-15",
      title: "Bad skill",
      plannedDurationMinutes: 60,
      strokes: ["nonexistent"],
    }),
  ).rejects.toThrowError();

  await asCoach.mutation(api.groups.setStatus, { groupId, status: "archived" });
  await expect(
    asCoach.mutation(api.practices.create, {
      groupId,
      date: "2026-09-15",
      title: "Bad group",
      plannedDurationMinutes: 60,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Group not found");
});

test("planned practices can be updated and cancelled", async () => {
  const { asCoach, groupId } = await setup();
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-15",
    title: "Kick focus",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.update, {
    practiceId,
    groupId,
    date: "2026-09-16",
    title: "Kick focus (moved)",
    plannedDurationMinutes: 75,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.cancel, { practiceId });
  const list = await asCoach.query(api.practices.listForGroup, { groupId });
  expect(list[0]).toMatchObject({
    status: "cancelled",
    title: "Kick focus (moved)",
  });
});

test("update is rejected once the practice is cancelled", async () => {
  const { asCoach, groupId } = await setup();
  const { practiceId } = await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-15",
    title: "Sprint",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.cancel, { practiceId });
  await expect(
    asCoach.mutation(api.practices.update, {
      practiceId,
      groupId,
      date: "2026-09-15",
      title: "Sprint v2",
      plannedDurationMinutes: 60,
      strokes: ["freestyle"],
    }),
  ).rejects.toThrowError("Only planned practices can be edited");
});

test("listUpcoming returns only future planned practices in date order", async () => {
  const { asCoach, groupId } = await setup();
  await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-10",
    title: "A",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  await asCoach.mutation(api.practices.create, {
    groupId,
    date: "2026-09-12",
    title: "B",
    plannedDurationMinutes: 60,
    strokes: ["freestyle"],
  });
  const upcoming = await asCoach.query(api.practices.listUpcoming, {
    fromDate: "2026-09-11",
  });
  expect(upcoming.map((p) => p.title)).toEqual(["B"]);
});

test("students cannot create practices", async () => {
  const { t, groupId } = await setup();
  const { userId } = await seedStudent(t, "Alex");
  await expect(
    t
      .withIdentity({ subject: userId })
      .mutation(api.practices.create, {
        groupId,
        date: "2026-09-15",
        title: "Nope",
        plannedDurationMinutes: 60,
        strokes: ["freestyle"],
      }),
  ).rejects.toThrowError("Not authorized");
});
