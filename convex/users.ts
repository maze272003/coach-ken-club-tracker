import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getViewer } from "./lib/access";

export const currentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      role: v.union(v.literal("coach"), v.literal("student")),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      image: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer || !viewer.role) return null;
    return {
      userId: viewer._id,
      role: viewer.role,
      name: viewer.name ?? null,
      email: viewer.email ?? null,
      image: viewer.image ?? null,
    };
  },
});

/**
 * Finds the coach user account by email, creating it on first login.
 * The credentials themselves live in server-side environment variables;
 * this only manages the persistent identity record.
 */
export const findOrCreateCoach = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .take(1);
    const user = existing[0];
    if (user) {
      if (user.role !== "coach") {
        return { ok: false as const };
      }
      return { ok: true as const, userId: user._id };
    }
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: "coach",
    });
    return { ok: true as const, userId };
  },
});

export const studentStatus = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!student) {
      return "not_student" as const;
    }
    return student.status;
  },
});

export const findByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .take(1);
    return users[0] ?? null;
  },
});

/**
 * Internal helper used by actions to verify the caller is the coach.
 */
export const requireCoachUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get("users", userId);
    if (!user || user.role !== "coach") return null;
    return user._id;
  },
});
