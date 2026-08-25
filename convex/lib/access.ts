import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type Viewer = Doc<"users">;

/**
 * Returns the authenticated user document, or null.
 * Never trust a client-provided user/student identifier.
 */
export async function getViewer(ctx: QueryCtx): Promise<Viewer | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get("users", userId);
}

export async function requireCoach(ctx: QueryCtx): Promise<Viewer | null> {
  const viewer = await getViewer(ctx);
  if (!viewer || viewer.role !== "coach") return null;
  return viewer;
}

export type StudentViewer = {
  user: Viewer;
  student: Doc<"students">;
};

/**
 * Resolves the authenticated student. Returns null unless the viewer
 * is an active student — this is the ownership anchor for all
 * student-scoped data access.
 */
export async function requireStudent(
  ctx: QueryCtx,
): Promise<StudentViewer | null> {
  const viewer = await getViewer(ctx);
  if (!viewer || viewer.role !== "student") return null;
  const student = await ctx.db
    .query("students")
    .withIndex("by_user", (q) => q.eq("userId", viewer._id))
    .unique();
  if (!student || student.status !== "active") return null;
  return { user: viewer, student };
}

/**
 * Resolves which student record the caller may act on:
 * - the coach may access any student
 * - a student may only access their own record (a client-provided
 *   studentId that does not match their own is rejected)
 * Returns null when the caller is neither coach nor active student,
 * or the requested student does not exist.
 */
export async function resolveStudentAccess(
  ctx: QueryCtx,
  studentId: Id<"students"> | null,
): Promise<Id<"students"> | null> {
  const coach = await requireCoach(ctx);
  if (coach) {
    if (studentId === null) return null;
    const student = await ctx.db.get("students", studentId);
    return student ? studentId : null;
  }
  const self = await requireStudent(ctx);
  if (!self) return null;
  if (studentId !== null && studentId !== self.student._id) return null;
  return self.student._id;
}
