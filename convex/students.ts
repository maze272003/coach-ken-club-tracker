import { v } from "convex/values";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireCoach, requireStudent } from "./lib/access";
import { attendanceStats, overallProgress } from "./lib/stats";
import {
  assertPassword,
  normalizeEmail,
  normalizeName,
} from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const studentStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

const studentSummary = v.object({
  studentId: v.id("students"),
  userId: v.id("users"),
  name: v.string(),
  email: v.string(),
  image: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("inactive")),
  attendancePercentage: v.union(v.number(), v.null()),
  overallProgress: v.union(v.number(), v.null()),
  currentGoalTitle: v.union(v.string(), v.null()),
});

/**
 * Coach-only: list students with derived progress stats, optionally
 * filtered by a name/email search string.
 */
export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.array(studentSummary),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const search = args.search?.trim().toLowerCase() ?? "";
    const students = await ctx.db.query("students").take(500);
    const rows = await Promise.all(
      students.map(async (student) => {
        const user = await ctx.db.get("users", student.userId);
        if (!user) return null;
        const name = user.name ?? "";
        const email = user.email ?? "";
        if (
          search !== "" &&
          !name.toLowerCase().includes(search) &&
          !email.toLowerCase().includes(search)
        ) {
          return null;
        }
        const [attendance, progress, goal] = await Promise.all([
          attendanceStats(ctx, student._id),
          overallProgress(ctx, student._id),
          ctx.db
            .query("trainingGoals")
            .withIndex("by_student_and_updated", (q) =>
              q.eq("studentId", student._id),
            )
            .order("desc")
            .take(1),
        ]);
        return {
          studentId: student._id,
          userId: user._id,
          name,
          email,
          image: user.image ?? null,
          status: student.status,
          attendancePercentage: attendance.percentage,
          overallProgress: progress,
          currentGoalTitle: goal[0]?.title ?? null,
        };
      }),
    );
    return rows.filter((row) => row !== null).sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Coach-only: full student record for the detail page.
 */
export const get = query({
  args: { studentId: v.id("students") },
  returns: v.union(
    v.null(),
    v.object({
      studentId: v.id("students"),
      userId: v.id("users"),
      name: v.string(),
      email: v.string(),
      image: v.union(v.string(), v.null()),
      status: v.union(v.literal("active"), v.literal("inactive")),
      createdAtMs: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) return null;
    const user = await ctx.db.get("users", student.userId);
    if (!user) return null;
    return {
      studentId: student._id,
      userId: user._id,
      name: user.name ?? "",
      email: user.email ?? "",
      image: user.image ?? null,
      status: student.status,
      createdAtMs: student._creationTime,
    };
  },
});

/**
 * Coach-only action: creates a student's auth account and profile.
 * This is the only way student accounts come into existence.
 */
export const create = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    status: studentStatusValidator,
    image: v.optional(v.string()),
  },
  returns: v.object({ studentId: v.id("students") }),
  handler: async (ctx, args) => {
    const coachId = await ctx.runQuery(internal.users.requireCoachUser, {});
    if (!coachId) throw new ConvexError(NOT_AUTHORIZED);

    const name = normalizeName(args.name);
    const email = normalizeEmail(args.email);
    assertPassword(args.password);
    const image =
      args.image !== undefined ? assertImageUrl(args.image) : undefined;

    const existing = await ctx.runQuery(internal.users.findByEmail, { email });
    if (existing) {
      throw new ConvexError("A user with this email already exists");
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: { email, name, role: "student", ...(image ? { image } : {}) },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });

    const studentId: Id<"students"> = await ctx.runMutation(
      internal.students.createProfile,
      {
        userId: created.user._id,
        status: args.status,
      },
    );
    return { studentId };
  },
});

/**
 * Coach-only: update a student's profile (name, avatar, status).
 * Email is immutable: it is the account identifier.
 */
export const update = mutation({
  args: {
    studentId: v.id("students"),
    name: v.optional(v.string()),
    status: v.optional(studentStatusValidator),
    image: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");

    const userPatch: { name?: string; image?: string | undefined } = {};
    if (args.name !== undefined) {
      userPatch.name = normalizeName(args.name);
    }
    if (args.image !== undefined) {
      userPatch.image =
        args.image === null ? undefined : assertImageUrl(args.image);
    }
    if (args.name !== undefined || args.image !== undefined) {
      await ctx.db.patch("users", student.userId, userPatch);
    }
    if (args.status !== undefined) {
      await ctx.db.patch("students", args.studentId, {
        status: args.status,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Coach-only action: set a new password for a student and end their
 * existing sessions. The password is never readable afterwards.
 */
export const resetPassword = action({
  args: { studentId: v.id("students"), password: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coachId = await ctx.runQuery(internal.users.requireCoachUser, {});
    if (!coachId) throw new ConvexError(NOT_AUTHORIZED);
    assertPassword(args.password);

    const student = await ctx.runQuery(internal.students.getProfile, {
      studentId: args.studentId,
    });
    if (!student) throw new ConvexError("Student not found");

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: student.email, secret: args.password },
    });
    await invalidateSessions(ctx, { userId: student.userId });
    return null;
  },
});

/**
 * Student-only: update the basic profile information a student is
 * allowed to change (display name and avatar picture).
 */
export const updateOwnProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);
    if (args.name !== undefined) {
      await ctx.db.patch("users", self.user._id, { name: normalizeName(args.name) });
    }
    if (args.image !== undefined) {
      await ctx.db.patch("users", self.user._id, {
        image: args.image === null ? undefined : assertImageUrl(args.image),
      });
    }
    return null;
  },
});

/**
 * Student-only: the signed-in student's own profile.
 */
export const myProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      email: v.string(),
      image: v.union(v.string(), v.null()),
      status: v.union(v.literal("active"), v.literal("inactive")),
      createdAtMs: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) return null;
    return {
      name: self.user.name ?? "",
      email: self.user.email ?? "",
      image: self.user.image ?? null,
      status: self.student.status,
      createdAtMs: self.student._creationTime,
    };
  },
});

function assertImageUrl(value: string): string {
  const url = value.trim();
  if (url.length === 0 || url.length > 2048) {
    throw new ConvexError("Invalid image URL");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new ConvexError("Image URL must start with http:// or https://");
  }
  return url;
}

/**
 * Internal: creates the student profile row. Skill progress records
 * are created on demand when the coach first saves progress for a
 * skill from the catalog.
 */
export const createProfile = internalMutation({
  args: { userId: v.id("users"), status: studentStatusValidator },
  returns: v.id("students"),
  handler: async (ctx, args) => {
    const studentId = await ctx.db.insert("students", {
      userId: args.userId,
      status: args.status,
      updatedAt: Date.now(),
    });
    return studentId;
  },
});

/**
 * Internal: student profile lookup used by actions.
 */
export const getProfile = internalQuery({
  args: { studentId: v.id("students") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      email: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const student = await ctx.db.get("students", args.studentId);
    if (!student) return null;
    const user = await ctx.db.get("users", student.userId);
    if (!user || !user.email) return null;
    return { userId: user._id, email: user.email };
  },
});
