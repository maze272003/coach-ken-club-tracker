import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCoach, requireStudent, resolveStudentAccess } from "./lib/access";
import {
  assertProgress,
  normalizeSkillName,
  slugifySkillName,
} from "./lib/validation";

const NOT_AUTHORIZED = "Not authorized";

const skillStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

const catalogEntry = v.object({
  skillId: v.id("skills"),
  key: v.string(),
  name: v.string(),
  status: skillStatusValidator,
});

const studentSkillRecord = v.object({
  key: v.string(),
  name: v.string(),
  progress: v.number(),
  updatedAtMs: v.number(),
});

async function findSkillByKey(
  ctx: QueryCtx,
  key: string,
): Promise<Doc<"skills"> | null> {
  const rows = await ctx.db
    .query("skills")
    .withIndex("by_key", (q) => q.eq("key", key))
    .take(1);
  return rows[0] ?? null;
}

/**
 * Map of active skill key -> display name for the whole catalog.
 */
async function activeSkillNames(ctx: QueryCtx): Promise<Map<string, string>> {
  const catalog = await ctx.db
    .query("skills")
    .withIndex("by_key")
    .take(500);
  const map = new Map<string, string>();
  for (const skill of catalog) {
    if (skill.status === "active") map.set(skill.key, skill.name);
  }
  return map;
}

/**
 * Used by training.ts: every skill referenced by a session must exist
 * in the catalog. Archived skills are allowed so historical sessions
 * stay editable — archiving only removes a skill from pickers.
 */
export async function assertExistingSkillKeys(
  ctx: QueryCtx,
  keys: string[],
): Promise<void> {
  for (const key of keys) {
    const skill = await findSkillByKey(ctx, key);
    if (!skill) throw new ConvexError(`Unknown skill: ${key}`);
  }
}

/**
 * Coach or student: the full skill catalog (active and archived),
 * sorted by key. Archived entries are returned so clients can still
 * label historical records; pickers filter to active.
 */
export const catalog = query({
  args: {},
  returns: v.array(catalogEntry),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) {
      const student = await requireStudent(ctx);
      if (!student) throw new ConvexError(NOT_AUTHORIZED);
    }

    const skills = await ctx.db
      .query("skills")
      .withIndex("by_key")
      .take(500);
    return skills.map((s) => ({
      skillId: s._id,
      key: s.key,
      name: s.name,
      status: s.status,
    }));
  },
});

/**
 * Coach-only: add a skill program. The key is derived from the name;
 * if an archived skill with the same key exists it is restored and
 * renamed instead of duplicating.
 */
export const add = mutation({
  args: { name: v.string() },
  returns: v.object({ skillId: v.id("skills") }),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const name = normalizeSkillName(args.name);
    const key = slugifySkillName(name);

    const existing = await findSkillByKey(ctx, key);
    const now = Date.now();
    if (existing) {
      if (existing.status === "active") {
        throw new ConvexError(`A skill named "${existing.name}" already exists`);
      }
      await ctx.db.patch("skills", existing._id, {
        name,
        status: "active",
        updatedAt: now,
      });
      return { skillId: existing._id };
    }

    const skillId = await ctx.db.insert("skills", {
      key,
      name,
      status: "active",
      updatedAt: now,
    });
    return { skillId };
  },
});

/**
 * Coach-only: rename a skill. The key stays stable so existing
 * progress records and sessions keep pointing at it.
 */
export const rename = mutation({
  args: { skillId: v.id("skills"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const skill = await ctx.db.get("skills", args.skillId);
    if (!skill) throw new ConvexError("Skill not found");

    await ctx.db.patch("skills", args.skillId, {
      name: normalizeSkillName(args.name),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: archive or restore a skill. Archiving hides it from
 * pickers and student views; historical data is preserved.
 */
export const setStatus = mutation({
  args: { skillId: v.id("skills"), status: skillStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const skill = await ctx.db.get("skills", args.skillId);
    if (!skill) throw new ConvexError("Skill not found");

    await ctx.db.patch("skills", args.skillId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Coach-only: record or update progress for one skill.
 * One record per (student, skill) — re-recording edits in place.
 */
export const setProgress = mutation({
  args: {
    studentId: v.id("students"),
    key: v.string(),
    progress: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) throw new ConvexError("Student not found");
    const skill = await findSkillByKey(ctx, args.key);
    if (!skill || skill.status !== "active") {
      throw new ConvexError(`Unknown or archived skill: ${args.key}`);
    }
    assertProgress(args.progress);

    const existing = await ctx.db
      .query("strokeSkills")
      .withIndex("by_student_and_stroke", (q) =>
        q.eq("studentId", args.studentId).eq("stroke", args.key),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("strokeSkills", existing._id, {
        progress: args.progress,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("strokeSkills", {
        studentId: args.studentId,
        stroke: args.key,
        progress: args.progress,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Coach or owning student: skill progress for a student, joined with
 * the catalog — only active skills, labeled and sorted by name.
 */
export const listForStudent = query({
  args: { studentId: v.id("students") },
  returns: v.array(studentSkillRecord),
  handler: async (ctx, args) => {
    const studentId = await resolveStudentAccess(ctx, args.studentId);
    if (studentId === null) throw new ConvexError(NOT_AUTHORIZED);

    const [records, names] = await Promise.all([
      ctx.db
        .query("strokeSkills")
        .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
        .take(100),
      activeSkillNames(ctx),
    ]);
    return records
      .filter((r) => names.has(r.stroke))
      .map((r) => ({
        key: r.stroke,
        name: names.get(r.stroke)!,
        progress: r.progress,
        updatedAtMs: r.updatedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Student-only: the signed-in student's own skill progress
 * (active skills only, labeled).
 */
export const my = query({
  args: {},
  returns: v.array(studentSkillRecord),
  handler: async (ctx) => {
    const self = await requireStudent(ctx);
    if (!self) throw new ConvexError(NOT_AUTHORIZED);

    const [records, names] = await Promise.all([
      ctx.db
        .query("strokeSkills")
        .withIndex("by_student_and_stroke", (q) =>
          q.eq("studentId", self.student._id),
        )
        .take(100),
      activeSkillNames(ctx),
    ]);
    return records
      .filter((r) => names.has(r.stroke))
      .map((r) => ({
        key: r.stroke,
        name: names.get(r.stroke)!,
        progress: r.progress,
        updatedAtMs: r.updatedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

const DEFAULT_SKILLS = [
  { key: "freestyle", name: "Freestyle" },
  { key: "backstroke", name: "Backstroke" },
  { key: "breaststroke", name: "Breaststroke" },
  { key: "butterfly", name: "Butterfly" },
  { key: "im", name: "Individual Medley" },
];

function titleCaseKey(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Internal: guarantees every skill key referenced by existing data has
 * a catalog entry. Inserts the four default skills when missing and
 * backfills any key found in progress records or training sessions.
 * Run once after deploying the catalog table:
 *   npx convex run skills:backfill
 */
export const backfill = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;

    const ensure = async (key: string, name: string) => {
      const existing = await findSkillByKey(ctx, key);
      if (existing) return;
      await ctx.db.insert("skills", {
        key,
        name,
        status: "active",
        updatedAt: now,
      });
      inserted += 1;
    };

    for (const skill of DEFAULT_SKILLS) {
      await ensure(skill.key, skill.name);
    }

    const [progress, sessions] = await Promise.all([
      ctx.db.query("strokeSkills").take(1000),
      ctx.db.query("trainingSessions").take(1000),
    ]);
    const referenced = new Set<string>();
    for (const record of progress) referenced.add(record.stroke);
    for (const session of sessions) {
      for (const key of session.strokes) referenced.add(key);
    }
    for (const key of referenced) {
      await ensure(key, titleCaseKey(key));
    }

    return { inserted };
  },
});
