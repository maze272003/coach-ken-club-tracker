import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("coach"), v.literal("student"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"]),
  skills: defineTable({
    key: v.string(),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"]),
  students: defineTable({
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    dateOfBirth: v.optional(v.string()),
    sex: v.optional(v.union(v.literal("M"), v.literal("F"))),
    parentName: v.optional(v.string()),
    parentPhone: v.optional(v.string()),
    parentEmail: v.optional(v.string()),
    joinedAt: v.optional(v.string()),
    medicalNotes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_group", ["groupId"]),
  attendance: defineTable({
    studentId: v.id("students"),
    date: v.string(),
    status: v.union(
      v.literal("present"),
      v.literal("late"),
      v.literal("absent"),
    ),
    updatedAt: v.number(),
  })
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_date", ["date"]),
  practices: defineTable({
    groupId: v.id("groups"),
    date: v.string(),
    startTime: v.optional(v.string()),
    title: v.string(),
    plannedDurationMinutes: v.number(),
    plannedDistanceMeters: v.optional(v.number()),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("planned"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    completedAt: v.optional(v.number()),
    actualDurationMinutes: v.optional(v.number()),
    actualDistanceMeters: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_group_and_date", ["groupId", "date"])
    .index("by_date", ["date"])
    .index("by_status", ["status"]),
  trainingSessions: defineTable({
    studentId: v.id("students"),
    practiceId: v.optional(v.id("practices")),
    date: v.string(),
    title: v.string(),
    durationMinutes: v.number(),
    distanceMeters: v.optional(v.number()),
    intensity: v.optional(
      v.union(v.literal("easy"), v.literal("moderate"), v.literal("hard")),
    ),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_student_and_practice", ["studentId", "practiceId"])
    .index("by_date", ["date"]),
  strokeSkills: defineTable({
    studentId: v.id("students"),
    stroke: v.string(),
    progress: v.number(),
    updatedAt: v.number(),
  }).index("by_student_and_stroke", ["studentId", "stroke"]),
  timeResults: defineTable({
    studentId: v.id("students"),
    date: v.string(),
    distanceMeters: v.number(),
    stroke: v.string(),
    course: v.union(v.literal("short"), v.literal("long")),
    timeMs: v.number(),
    context: v.union(
      v.literal("practice"),
      v.literal("time_trial"),
      v.literal("meet"),
    ),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_student_and_event", [
      "studentId",
      "stroke",
      "distanceMeters",
      "course",
    ])
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_date", ["date"])
    .index("by_event", ["stroke", "distanceMeters", "course"]),
  trainingGoals: defineTable({
    studentId: v.id("students"),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.optional(
      v.union(v.literal("manual"), v.literal("time"), v.literal("attendance")),
    ),
    distanceMeters: v.optional(v.number()),
    stroke: v.optional(v.string()),
    course: v.optional(v.union(v.literal("short"), v.literal("long"))),
    targetTimeMs: v.optional(v.number()),
    baselineBestMs: v.optional(v.number()),
    targetAttendancePct: v.optional(v.number()),
    target: v.optional(v.string()),
    progress: v.number(),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    targetDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_student_and_updated", ["studentId", "updatedAt"]),
  reports: defineTable({
    weekStart: v.string(),
    payloadJson: v.string(),
    createdAt: v.number(),
  }).index("by_week_start", ["weekStart"]),
});

