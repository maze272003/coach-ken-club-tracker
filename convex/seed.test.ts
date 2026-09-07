/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

test("upsertDemoGroups creates described groups and is idempotent", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(internal.seed.upsertDemoGroups, {});
  const second = await t.mutation(internal.seed.upsertDemoGroups, {});
  expect(second).toEqual(first);

  const groups = await t.run(async (ctx) => {
    return ctx.db.query("groups").collect();
  });
  const names = groups.map((g) => g.name).sort();
  expect(names).toEqual(["Competitive", "Development"]);
  for (const group of groups) {
    expect(group.description).toBeTruthy();
  }
});

test("addStudentData stores session metrics, im times, and all goal statuses", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.skills.backfill, {});
  const { studentId } = await seedStudent(t, "Alex Santos");

  await t.mutation(internal.seed.addStudentData, {
    studentId,
    skills: [{ key: "freestyle", progress: 65 }],
    attendance: [
      { date: "2026-01-10", status: "present" },
      { date: "2026-01-11", status: "absent" },
    ],
    sessions: [
      {
        date: "2026-01-10",
        title: "IM Prep",
        durationMinutes: 90,
        distanceMeters: 3000,
        intensity: "hard",
        strokes: ["freestyle"],
        notes: "Transition work.",
      },
    ],
    times: [
      {
        date: "2026-01-10",
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        timeMs: 149800,
        context: "meet",
      },
    ],
    goals: [
      {
        title: "Sub-2:20 200m IM",
        description: "IM endurance goal.",
        type: "time",
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        targetTimeMs: 140000,
        baselineBestMs: 149800,
        progress: 0,
        status: "not_started",
        targetDate: "2026-06-01",
        updatedDaysAgo: 1,
      },
      {
        title: "Old season goal",
        description: "Retired.",
        type: "manual",
        target: "Legal turns",
        progress: 40,
        status: "archived",
        targetDate: "2025-12-01",
        updatedDaysAgo: 30,
      },
    ],
  });

  const sessions = await t.run(async (ctx) => {
    return ctx.db.query("trainingSessions").collect();
  });
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({
    studentId,
    distanceMeters: 3000,
    intensity: "hard",
  });

  const times = await t.run(async (ctx) => {
    return ctx.db.query("timeResults").collect();
  });
  expect(times).toHaveLength(1);
  expect(times[0]).toMatchObject({ stroke: "im", timeMs: 149800 });

  const goals = await t.run(async (ctx) => {
    return ctx.db.query("trainingGoals").collect();
  });
  expect(goals.map((g) => g.status).sort()).toEqual(["archived", "not_started"]);
});

test("addStudentData rejects sessions on days without attendance", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.skills.backfill, {});
  const { studentId } = await seedStudent(t, "Maria Reyes");

  await expect(
    t.mutation(internal.seed.addStudentData, {
      studentId,
      skills: [],
      attendance: [{ date: "2026-01-10", status: "absent" }],
      sessions: [
        {
          date: "2026-01-10",
          title: "Ghost session",
          durationMinutes: 60,
          strokes: ["freestyle"],
          notes: "",
        },
      ],
      times: [],
      goals: [],
    }),
  ).rejects.toThrowError(/without recorded attendance/);
});

test("addStudentData rejects completed goals below 100%", async () => {
  const t = convexTest(schema, modules);
  const { studentId } = await seedStudent(t, "Daniel Cruz");

  await expect(
    t.mutation(internal.seed.addStudentData, {
      studentId,
      skills: [],
      attendance: [],
      sessions: [],
      times: [],
      goals: [
        {
          title: "Almost done",
          description: "",
          type: "manual",
          progress: 90,
          status: "completed",
          targetDate: "2026-06-01",
          updatedDaysAgo: 1,
        },
      ],
    }),
  ).rejects.toThrowError(/must be 100%/);
});

test("addDemoPractices stores cancelled practices without completion fields", async () => {
  const t = convexTest(schema, modules);
  const { competitiveId, developmentId } = await t.mutation(
    internal.seed.upsertDemoGroups,
    {},
  );

  await t.mutation(internal.seed.addDemoPractices, {
    practices: [
      {
        groupId: competitiveId,
        date: "2026-01-10",
        startTime: "17:30",
        title: "IM Prep",
        plannedDurationMinutes: 90,
        plannedDistanceMeters: 3000,
        strokes: ["freestyle"],
        notes: "",
        status: "completed",
      },
      {
        groupId: developmentId,
        date: "2026-01-08",
        startTime: "16:30",
        title: "Kick Workshop",
        plannedDurationMinutes: 45,
        plannedDistanceMeters: 700,
        strokes: ["breaststroke"],
        notes: "Pool closure.",
        status: "cancelled",
      },
    ],
  });

  const practices = await t.run(async (ctx) => {
    return ctx.db.query("practices").collect();
  });
  expect(practices).toHaveLength(2);
  const completed = practices.find((p) => p.status === "completed")!;
  expect(completed.completedAt).toBeDefined();
  expect(completed.actualDurationMinutes).toBe(90);
  const cancelled = practices.find((p) => p.status === "cancelled")!;
  expect(cancelled.completedAt).toBeUndefined();
  expect(cancelled.actualDurationMinutes).toBeUndefined();
});

test("seed:status reports counts and demo account presence", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.upsertDemoGroups, {});

  const status = await t.query(api.seed.status, {});
  expect(status.counts.groups).toBe(2);
  expect(status.counts.practicesCancelled).toBe(0);
  expect(status.demoAccounts.length).toBe(12);
  expect(status.demoAccounts.every((account) => !account.exists)).toBe(true);

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "Alex Santos",
      email: "alex.santos@demo.swim",
      role: "student",
    });
  });
  const after = await t.query(api.seed.status, {});
  expect(
    after.demoAccounts.find((a) => a.email === "alex.santos@demo.swim")!.exists,
  ).toBe(true);
});

test("dataOverview:summary is coach-only", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.dataOverview.summary, {})).rejects.toThrowError(
    "Not authorized",
  );

  const { userId } = await seedStudent(t, "Lily Wu");
  await expect(
    t.withIdentity({ subject: userId }).query(api.dataOverview.summary, {}),
  ).rejects.toThrowError("Not authorized");
});

test("dataOverview:summary reports per-student coverage for the coach", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  await t.mutation(internal.skills.backfill, {});
  const { studentId } = await seedStudent(t, "Alex Santos");
  await t.run(async (ctx) => {
    await ctx.db.patch("students", studentId, {
      parentName: "Carlos Santos",
      medicalNotes: "Mild asthma.",
    });
  });
  await t.mutation(internal.seed.addStudentData, {
    studentId,
    skills: [{ key: "freestyle", progress: 70 }],
    attendance: [{ date: "2026-01-10", status: "present" }],
    sessions: [
      {
        date: "2026-01-10",
        title: "IM Prep",
        durationMinutes: 90,
        distanceMeters: 3000,
        intensity: "hard",
        strokes: ["freestyle"],
        notes: "",
      },
    ],
    times: [
      {
        date: "2026-01-10",
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        timeMs: 149800,
        context: "meet",
      },
    ],
    goals: [
      {
        title: "Sub-2:20 200m IM",
        description: "",
        type: "time",
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        targetTimeMs: 140000,
        baselineBestMs: 149800,
        progress: 0,
        status: "not_started",
        targetDate: "2026-06-01",
        updatedDaysAgo: 1,
      },
    ],
  });

  const summary = await t
    .withIdentity({ subject: coachId })
    .query(api.dataOverview.summary, {});

  expect(summary.students).toHaveLength(1);
  const row = summary.students[0]!;
  expect(row.name).toBe("Alex Santos");
  expect(row.hasParentContact).toBe(true);
  expect(row.hasMedicalNotes).toBe(true);
  expect(row.sessionCount).toBe(1);
  expect(row.sessionsWithMetrics).toBe(1);
  expect(row.imTimeCount).toBe(1);
  expect(row.goalsByStatus.not_started).toBe(1);
});
