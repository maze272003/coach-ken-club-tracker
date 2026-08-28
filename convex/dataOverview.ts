import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { attendanceStats, overallProgress } from "./lib/stats";

const NOT_AUTHORIZED = "Not authorized";

const goalStatusCounts = v.object({
  not_started: v.number(),
  in_progress: v.number(),
  completed: v.number(),
  archived: v.number(),
});

const studentCoverage = v.object({
  studentId: v.id("students"),
  name: v.string(),
  email: v.string(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  groupName: v.union(v.string(), v.null()),
  hasParentContact: v.boolean(),
  hasMedicalNotes: v.boolean(),
  attendanceCount: v.number(),
  attendedCount: v.number(),
  attendancePct: v.union(v.number(), v.null()),
  sessionCount: v.number(),
  sessionsWithMetrics: v.number(),
  timeCount: v.number(),
  imTimeCount: v.number(),
  skillCount: v.number(),
  overallProgress: v.union(v.number(), v.null()),
  goalCount: v.number(),
  goalsByStatus: goalStatusCounts,
});

const groupCoverage = v.object({
  groupId: v.id("groups"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("archived")),
  memberCount: v.number(),
  practiceCount: v.number(),
});

/**
 * Coach-only: per-student data completeness matrix and group overview,
 * used by the Data page to verify a seed / migration landed correctly.
 */
export const summary = query({
  args: {},
  returns: v.object({
    students: v.array(studentCoverage),
    groups: v.array(groupCoverage),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const [groups, students, practices] = await Promise.all([
      ctx.db.query("groups").take(500),
      ctx.db.query("students").take(500),
      ctx.db.query("practices").take(1000),
    ]);

    const groupRows: {
      groupId: (typeof groups)[number]["_id"];
      name: string;
      description: string | null;
      status: "active" | "archived";
      memberCount: number;
      practiceCount: number;
    }[] = groups.map((group) => ({
      groupId: group._id,
      name: group.name,
      description: group.description ?? null,
      status: group.status,
      memberCount: students.filter((s) => s.groupId === group._id).length,
      practiceCount: practices.filter((p) => p.groupId === group._id).length,
    }));

    const studentRows = await Promise.all(
      students.map(async (student) => {
        const user = await ctx.db.get("users", student.userId);
        const [attendance, progress, sessions, times, skills, goals] =
          await Promise.all([
            attendanceStats(ctx, student._id),
            overallProgress(ctx, student._id),
            ctx.db
              .query("trainingSessions")
              .withIndex("by_student_and_date", (q) =>
                q.eq("studentId", student._id),
              )
              .take(1000),
            ctx.db
              .query("timeResults")
              .withIndex("by_student_and_date", (q) =>
                q.eq("studentId", student._id),
              )
              .take(1000),
            ctx.db
              .query("strokeSkills")
              .withIndex("by_student_and_stroke", (q) =>
                q.eq("studentId", student._id),
              )
              .take(100),
            ctx.db
              .query("trainingGoals")
              .withIndex("by_student_and_updated", (q) =>
                q.eq("studentId", student._id),
              )
              .take(100),
          ]);

        const group = student.groupId
          ? groups.find((g) => g._id === student.groupId)
          : undefined;

        return {
          studentId: student._id,
          name: user?.name ?? "Unknown",
          email: user?.email ?? "",
          status: student.status,
          groupName: group?.name ?? null,
          hasParentContact:
            student.parentName !== undefined ||
            student.parentPhone !== undefined ||
            student.parentEmail !== undefined,
          hasMedicalNotes: student.medicalNotes !== undefined,
          attendanceCount: attendance.total,
          attendedCount: attendance.attended,
          attendancePct: attendance.percentage,
          sessionCount: sessions.length,
          sessionsWithMetrics: sessions.filter(
            (s) => s.distanceMeters !== undefined || s.intensity !== undefined,
          ).length,
          timeCount: times.length,
          imTimeCount: times.filter((t) => t.stroke === "im").length,
          skillCount: skills.length,
          overallProgress: progress,
          goalCount: goals.length,
          goalsByStatus: {
            not_started: goals.filter((g) => g.status === "not_started").length,
            in_progress: goals.filter((g) => g.status === "in_progress").length,
            completed: goals.filter((g) => g.status === "completed").length,
            archived: goals.filter((g) => g.status === "archived").length,
          },
        };
      }),
    );

    return {
      students: studentRows.sort((a, b) => a.name.localeCompare(b.name)),
      groups: groupRows.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
