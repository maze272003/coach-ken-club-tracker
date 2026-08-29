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
import { assertImageRef, resolveImageUrl } from "./lib/images";
import { attendanceStats, commitmentStats, overallProgress } from "./lib/stats";
import {
  assertDateOfBirth,
  assertDateString,
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
  groupId: v.union(v.id("groups"), v.null()),
  groupName: v.union(v.string(), v.null()),
  attendancePercentage: v.union(v.number(), v.null()),
  overallProgress: v.union(v.number(), v.null()),
  currentGoalTitle: v.union(v.string(), v.null()),
});

const profileFieldsArgs = {
  dateOfBirth: v.optional(v.string()),
  sex: v.optional(v.union(v.literal("M"), v.literal("F"))),
  parentName: v.optional(v.string()),
  parentPhone: v.optional(v.string()),
  parentEmail: v.optional(v.string()),
  joinedAt: v.optional(v.string()),
  medicalNotes: v.optional(v.string()),
};

const profileFieldsRecord = {
  dateOfBirth: v.union(v.string(), v.null()),
  sex: v.union(v.literal("M"), v.literal("F"), v.null()),
  parentName: v.union(v.string(), v.null()),
  parentPhone: v.union(v.string(), v.null()),
  parentEmail: v.union(v.string(), v.null()),
  joinedAt: v.union(v.string(), v.null()),
};

type ProfilePatch = {
  dateOfBirth?: string;
  sex?: "M" | "F";
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  joinedAt?: string;
  medicalNotes?: string;
};

function validateProfileFields(args: {
  dateOfBirth?: string;
  sex?: "M" | "F";
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  joinedAt?: string;
  medicalNotes?: string;
}): ProfilePatch {
  const fields: ProfilePatch = {};
  if (args.dateOfBirth !== undefined) {
    assertDateOfBirth(args.dateOfBirth);
    fields.dateOfBirth = args.dateOfBirth;
  }
  if (args.sex !== undefined) fields.sex = args.sex;
  if (args.parentName !== undefined) {
    const value = args.parentName.trim();
    if (value.length > 100) {
      throw new ConvexError("Parent name must be at most 100 characters");
    }
    if (value) fields.parentName = value;
  }
  if (args.parentPhone !== undefined) {
    const value = args.parentPhone.trim();
    if (value.length > 30) {
      throw new ConvexError("Parent phone must be at most 30 characters");
    }
    if (value) fields.parentPhone = value;
  }
  if (args.parentEmail !== undefined) {
    const value = args.parentEmail.trim();
    if (value) fields.parentEmail = normalizeEmail(value);
  }
  if (args.joinedAt !== undefined) {
    assertDateString(args.joinedAt);
    fields.joinedAt = args.joinedAt;
  }
  if (args.medicalNotes !== undefined) {
    const value = args.medicalNotes.trim();
    if (value.length > 2000) {
      throw new ConvexError("Medical notes must be at most 2000 characters");
    }
    if (value) fields.medicalNotes = value;
  }
  return fields;
}

/**
 * Coach-only: list students with derived progress stats, optionally
 * filtered by a name/email search string.
 */
export const list = query({
  args: {
    search: v.optional(v.string()),
    groupId: v.optional(v.union(v.id("groups"), v.null())),
  },
  returns: v.array(studentSummary),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_status")
      .take(500);
    const groupNameById = new Map(groups.map((g) => [g._id, g.name]));

    const search = args.search?.trim().toLowerCase() ?? "";
    const students = await ctx.db.query("students").take(500);
    const rows = await Promise.all(
      students.map(async (student) => {
        if (args.groupId !== undefined) {
          if (args.groupId === null) {
            if (student.groupId !== undefined) return null;
          } else if (student.groupId !== args.groupId) {
            return null;
          }
        }
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
          image: await resolveImageUrl(ctx, user.image),
          status: student.status,
          groupId: student.groupId ?? null,
          groupName: student.groupId
            ? (groupNameById.get(student.groupId) ?? null)
            : null,
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
      groupId: v.union(v.id("groups"), v.null()),
      groupName: v.union(v.string(), v.null()),
      medicalNotes: v.union(v.string(), v.null()),
      createdAtMs: v.number(),
      commitment: v.union(
        v.null(),
        v.object({
          held: v.number(),
          attended: v.number(),
          percentage: v.union(v.number(), v.null()),
        }),
      ),
      ...profileFieldsRecord,
    }),
  ),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) return null;
    const user = await ctx.db.get("users", student.userId);
    if (!user) return null;
    const group = student.groupId
      ? await ctx.db.get("groups", student.groupId)
      : null;
    const commitment = await commitmentStats(ctx, student._id);
    return {
      studentId: student._id,
      userId: user._id,
      name: user.name ?? "",
      email: user.email ?? "",
      image: await resolveImageUrl(ctx, user.image),
      status: student.status,
      groupId: student.groupId ?? null,
      groupName: group?.name ?? null,
      medicalNotes: student.medicalNotes ?? null,
      createdAtMs: student._creationTime,
      commitment,
      dateOfBirth: student.dateOfBirth ?? null,
      sex: student.sex ?? null,
      parentName: student.parentName ?? null,
      parentPhone: student.parentPhone ?? null,
      parentEmail: student.parentEmail ?? null,
      joinedAt: student.joinedAt ?? null,
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
    groupId: v.optional(v.id("groups")),
    ...profileFieldsArgs,
  },
  returns: v.object({ studentId: v.id("students") }),
  handler: async (ctx, args) => {
    const coachId = await ctx.runQuery(internal.users.requireCoachUser, {});
    if (!coachId) throw new ConvexError(NOT_AUTHORIZED);

    const name = normalizeName(args.name);
    const email = normalizeEmail(args.email);
    assertPassword(args.password);
    const image =
      args.image !== undefined ? await assertImageRef(ctx, args.image) : undefined;
    const profile = validateProfileFields(args);

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
        ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
        ...profile,
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
    groupId: v.optional(v.union(v.id("groups"), v.null())),
    ...profileFieldsArgs,
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
        args.image === null ? undefined : await assertImageRef(ctx, args.image);
    }
    if (args.name !== undefined || args.image !== undefined) {
      await ctx.db.patch("users", student.userId, userPatch);
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.groupId !== undefined) {
      if (args.groupId === null) {
        patch.groupId = undefined;
      } else {
        const group = await ctx.db.get("groups", args.groupId);
        if (!group || group.status !== "active") {
          throw new ConvexError("Group not found");
        }
        patch.groupId = args.groupId;
      }
    }
    Object.assign(patch, validateProfileFields(args));
    await ctx.db.patch("students", args.studentId, patch);
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
        image:
          args.image === null ? undefined : await assertImageRef(ctx, args.image),
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
      ...profileFieldsRecord,
    }),
  ),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) return null;
    return {
      name: self.user.name ?? "",
      email: self.user.email ?? "",
      image: await resolveImageUrl(ctx, self.user.image),
      status: self.student.status,
      createdAtMs: self.student._creationTime,
      dateOfBirth: self.student.dateOfBirth ?? null,
      sex: self.student.sex ?? null,
      parentName: self.student.parentName ?? null,
      parentPhone: self.student.parentPhone ?? null,
      parentEmail: self.student.parentEmail ?? null,
      joinedAt: self.student.joinedAt ?? null,
    };
  },
});

/**
 * Signed upload URL for avatar images. The coach may upload on behalf of
 * a student; students may upload for their own profile. The client POSTs
 * the file to the returned URL and stores the returned storageId as the
 * user's image reference.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) {
      const student = await requireStudent(ctx);
      if (!student) throw new ConvexError(NOT_AUTHORIZED);
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Internal: creates the student profile row. Skill progress records
 * are created on demand when the coach first saves progress for a
 * skill from the catalog.
 */
export const createProfile = internalMutation({
  args: {
    userId: v.id("users"),
    status: studentStatusValidator,
    groupId: v.optional(v.id("groups")),
    ...profileFieldsArgs,
  },
  returns: v.id("students"),
  handler: async (ctx, args) => {
    if (args.groupId !== undefined) {
      const group = await ctx.db.get("groups", args.groupId);
      if (!group || group.status !== "active") {
        throw new ConvexError("Group not found");
      }
    }
    const studentId = await ctx.db.insert("students", {
      userId: args.userId,
      status: args.status,
      ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
      ...validateProfileFields(args),
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
