import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { normalizeGroupName } from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const groupStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

const groupRecord = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  status: groupStatusValidator,
  memberCount: v.number(),
});

type Ctx = Parameters<typeof requireCoach>[0];

async function assertNameFree(
  ctx: Ctx,
  name: string,
  exceptGroupId?: string,
): Promise<void> {
  const groups = await ctx.db
    .query("groups")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(500);
  const taken = groups.some(
    (g) =>
      g.name.toLowerCase() === name.toLowerCase() && g._id !== exceptGroupId,
  );
  if (taken) {
    throw new ConvexError("An active group with this name already exists");
  }
}

/**
 * Coach-only: all groups with member counts, active groups first.
 */
export const list = query({
  args: {},
  returns: v.array(groupRecord),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const groups = await ctx.db.query("groups").withIndex("by_status").take(500);
    const rows = await Promise.all(
      groups.map(async (group) => ({
        groupId: group._id,
        name: group.name,
        description: group.description ?? null,
        status: group.status,
        memberCount: (
          await ctx.db
            .query("students")
            .withIndex("by_group", (q) => q.eq("groupId", group._id))
            .take(500)
        ).length,
      })),
    );
    const rank = (s: string) => (s === "active" ? 0 : 1);
    return rows.sort(
      (a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name),
    );
  },
});

/**
 * Coach-only: create a group. Names are unique among active groups.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.object({ groupId: v.id("groups") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const name = normalizeGroupName(args.name);
    await assertNameFree(ctx, name);
    const description = args.description?.trim();
    const groupId = await ctx.db.insert("groups", {
      name,
      ...(description ? { description } : {}),
      status: "active",
      updatedAt: Date.now(),
    });
    return { groupId };
  },
});

/**
 * Coach-only: rename a group / edit its description.
 */
export const rename = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError("Group not found");
    const patch: { name?: string; description?: string; updatedAt: number } = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      patch.name = normalizeGroupName(args.name);
      if (group.status === "active") {
        await assertNameFree(ctx, patch.name, group._id);
      }
    }
    if (args.description !== undefined) {
      const description = args.description.trim();
      if (description) patch.description = description;
    }
    await ctx.db.patch("groups", args.groupId, patch);
    return null;
  },
});

/**
 * Coach-only: archive or reactivate a group. Groups are never deleted
 * (history stays linkable). Archiving keeps memberships.
 */
export const setStatus = mutation({
  args: { groupId: v.id("groups"), status: groupStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError("Group not found");
    await ctx.db.patch("groups", args.groupId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: assign a student to an active group, or clear their
 * group by passing null.
 */
export const assignStudent = mutation({
  args: {
    studentId: v.id("students"),
    groupId: v.union(v.id("groups"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");
    if (args.groupId !== null) {
      const group = await ctx.db.get("groups", args.groupId);
      if (!group || group.status !== "active") {
        throw new ConvexError("Group not found");
      }
    }
    await ctx.db.patch("students", args.studentId, {
      groupId: args.groupId === null ? undefined : args.groupId,
      updatedAt: Date.now(),
    });
    return null;
  },
});
