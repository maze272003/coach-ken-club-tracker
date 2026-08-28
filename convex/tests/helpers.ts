import type { convexTest } from "convex-test";
import type { Id } from "../_generated/dataModel";

type T = ReturnType<typeof convexTest>;

export async function seedCoach(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    return ctx.db.insert("users", { name: "Coach Ken", role: "coach" });
  });
}

export async function seedStudent(
  t: T,
  name: string,
): Promise<{ userId: Id<"users">; studentId: Id<"students"> }> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name, role: "student" });
    const studentId = await ctx.db.insert("students", {
      userId,
      status: "active",
      updatedAt: Date.now(),
    });
    return { userId, studentId };
  });
}
