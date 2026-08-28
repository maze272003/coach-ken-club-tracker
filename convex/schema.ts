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
  trainingSessions: defineTable({
    studentId: v.id("students"),
    date: v.string(),
    title: v.string(),
    durationMinutes: v.number(),
    strokes: v.array(v.string()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_date", ["date"]),
  strokeSkills: defineTable({
    studentId: v.id("students"),
    stroke: v.string(),
    progress: v.number(),
    updatedAt: v.number(),
  }).index("by_student_and_stroke", ["studentId", "stroke"]),
  trainingGoals: defineTable({
    studentId: v.id("students"),
    title: v.string(),
    description: v.optional(v.string()),
    target: v.optional(v.string()),
    progress: v.number(),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
    ),
    targetDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_student_and_updated", ["studentId", "updatedAt"]),
});
