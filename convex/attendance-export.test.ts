/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedCoach, seedStudent } from "./tests/helpers";

const DATE = "2026-08-15";

test("exportAttendance compacts daily training sessions and swim times into attendance records", async () => {
  const t = convexTest(schema, modules);
  const coachId = await seedCoach(t);
  const asCoach = t.withIdentity({ subject: coachId });

  // 1. Setup Student, Group & Skills
  const { groupId } = await asCoach.mutation(api.groups.create, {
    name: "Competitive",
  });
  await asCoach.mutation(api.skills.add, { name: "Freestyle" });
  await asCoach.mutation(api.skills.add, { name: "Backstroke" });


  const { studentId } = await seedStudent(t, "Alex Santos");
  await asCoach.mutation(api.groups.assignStudent, {
    studentId,
    groupId,
  });


  // 2. Record Attendance
  await asCoach.mutation(api.attendance.record, {
    studentId,
    date: DATE,
    status: "present",
  });

  // 3. Record Training Session on this date
  await asCoach.mutation(api.training.create, {
    studentId,
    date: DATE,
    title: "IM Prep",
    durationMinutes: 90,
    strokes: ["freestyle", "backstroke"],
    notes: "Great turn speed",
  });

  // 4. Record Swim Times on this date
  await asCoach.mutation(api.times.create, {
    studentId,
    date: DATE,
    stroke: "freestyle",
    distanceMeters: 50,
    course: "short",
    timeMs: 28200,
    context: "time_trial",
    notes: "New PB breakout",
  });

  await asCoach.mutation(api.times.create, {
    studentId,
    date: DATE,
    stroke: "freestyle",
    distanceMeters: 100,
    course: "short",
    timeMs: 62100,
    context: "meet",
  });

  // 5. Query Export Attendance
  const result = await asCoach.query(api.attendance.exportAttendance, {
    studentId,
    startDate: DATE,
    endDate: DATE,
  });

  expect(result.records).toHaveLength(1);
  const record = result.records[0];

  expect(record.studentName).toBe("Alex Santos");
  expect(record.groupName).toBe("Competitive");
  expect(record.date).toBe(DATE);
  expect(record.status).toBe("present");

  // Compact Training Data
  expect(record.sessionsCount).toBe(1);
  expect(record.totalTrainingMinutes).toBe(90);
  expect(record.strokesPracticed).toEqual(["freestyle", "backstroke"]);
  expect(record.trainingSummary).toContain("IM Prep");
  expect(record.trainingSummary).toContain("90 mins");
  expect(record.sessionNotes).toBe("Great turn speed");

  // Compact Time Trial & PB Data
  expect(record.timesCount).toBe(2);
  expect(record.timesSummary).toContain("50m Freestyle (SCM): 28.20");
  expect(record.timesSummary).toContain("100m Freestyle (SCM): 1:02.10");
  expect(record.personalBestsAchieved.length).toBeGreaterThanOrEqual(1);
  expect(record.timeNotes).toContain("New PB breakout");

  // Stats
  expect(result.stats.total).toBe(1);
  expect(result.stats.attended).toBe(1);
  expect(result.stats.totalTrainingMinutes).toBe(90);
  expect(result.stats.totalTimesRecorded).toBe(2);
});
