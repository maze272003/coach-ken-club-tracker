import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DEMO_PASSWORD = "swim-demo-2026";

type DemoStudent = {
  name: string;
  email: string;
  skills: Record<string, number>;
  attendancePlan: ("present" | "late" | "absent")[];
  sessions: {
    daysAgo: number;
    title: string;
    durationMinutes: number;
    strokes: string[];
    notes: string;
  }[];
  goals: {
    title: string;
    description: string;
    target: string;
    progress: number;
    status: "not_started" | "in_progress" | "completed";
    targetDateDaysAhead: number;
  }[];
};

const DEMO_STUDENTS: DemoStudent[] = [
  {
    name: "Alex Santos",
    email: "alex.santos@demo.swim",
    skills: { freestyle: 80, backstroke: 65, breaststroke: 55, butterfly: 35 },
    attendancePlan: [
      "present", "present", "present", "late", "present",
      "present", "absent", "present", "present", "late",
      "present", "present",
    ],
    sessions: [
      {
        daysAgo: 1,
        title: "Freestyle & Backstroke",
        durationMinutes: 90,
        strokes: ["freestyle", "backstroke"],
        notes: "Improve breathing and body position.",
      },
      {
        daysAgo: 4,
        title: "Freestyle Technique",
        durationMinutes: 60,
        strokes: ["freestyle"],
        notes: "Focus on stroke length and catch.",
      },
      {
        daysAgo: 7,
        title: "Endurance Set",
        durationMinutes: 75,
        strokes: ["freestyle", "breaststroke"],
        notes: "4x200m negative split.",
      },
    ],
    goals: [
      {
        title: "Improve 100m Freestyle",
        description: "Improve freestyle speed and endurance.",
        target: "Complete 100m freestyle under 2:00",
        progress: 72,
        status: "in_progress",
        targetDateDaysAhead: 45,
      },
    ],
  },
  {
    name: "Maria Reyes",
    email: "maria.reyes@demo.swim",
    skills: { freestyle: 70, backstroke: 75, breaststroke: 60, butterfly: 45 },
    attendancePlan: [
      "present", "late", "present", "present", "present",
      "present", "present", "late", "present", "present",
      "present", "absent",
    ],
    sessions: [
      {
        daysAgo: 2,
        title: "Backstroke Focus",
        durationMinutes: 60,
        strokes: ["backstroke"],
        notes: "Hip rotation and streamline off the wall.",
      },
      {
        daysAgo: 5,
        title: "IM Prep",
        durationMinutes: 90,
        strokes: ["butterfly", "backstroke", "breaststroke", "freestyle"],
        notes: "Transition work between strokes.",
      },
    ],
    goals: [
      {
        title: "Master Butterfly Technique",
        description: "Build a consistent two-beat kick and clean breathing.",
        target: "Swim 50m butterfly without stopping",
        progress: 45,
        status: "in_progress",
        targetDateDaysAhead: 60,
      },
      {
        title: "Complete 200m Backstroke Set",
        description: "Baseline endurance goal for the season.",
        target: "4x50m backstroke under 1:10 each",
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -10,
      },
    ],
  },
  {
    name: "Daniel Cruz",
    email: "daniel.cruz@demo.swim",
    skills: { freestyle: 55, backstroke: 40, breaststroke: 70, butterfly: 20 },
    attendancePlan: [
      "absent", "present", "late", "present", "absent",
      "present", "present", "present", "absent", "present",
      "late", "present",
    ],
    sessions: [
      {
        daysAgo: 3,
        title: "Breaststroke Fundamentals",
        durationMinutes: 45,
        strokes: ["breaststroke"],
        notes: "Timing of the pull-kick cycle.",
      },
    ],
    goals: [
      {
        title: "Learn Legal Butterfly",
        description: "Start from basics: dolphin kick and single-arm drills.",
        target: "Complete 25m butterfly with legal form",
        progress: 20,
        status: "in_progress",
        targetDateDaysAhead: 90,
      },
    ],
  },
];

function dateStringFromOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Seeds demo data — only runs when no students exist yet.
 * Run with: npx convex run seed:seed
 */
export const seed = action({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    const count = await ctx.runQuery(internal.seed.studentCount, {});
    if (count > 0) {
      throw new ConvexError(
        "Students already exist — seeding is only allowed on an empty database.",
      );
    }

    for (const demo of DEMO_STUDENTS) {
      const created = await createAccount(ctx, {
        provider: "password",
        account: { id: demo.email, secret: DEMO_PASSWORD },
        profile: {
          email: demo.email,
          name: demo.name,
          role: "student",
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });
      const studentId: Id<"students"> = await ctx.runMutation(
        internal.students.createProfile,
        { userId: created.user._id, status: "active" },
      );

      await ctx.runMutation(internal.seed.addStudentData, {
        studentId,
        skills: Object.entries(demo.skills).map(([stroke, progress]) => ({
          stroke,
          progress,
        })),
        attendance: demo.attendancePlan.map((status, i) => ({
          date: dateStringFromOffset(demo.attendancePlan.length - i),
          status,
        })),
        sessions: demo.sessions.map((session) => ({
          date: dateStringFromOffset(session.daysAgo),
          title: session.title,
          durationMinutes: session.durationMinutes,
          strokes: session.strokes,
          notes: session.notes,
        })),
        goals: demo.goals.map((goal) => ({
          title: goal.title,
          description: goal.description,
          target: goal.target,
          progress: goal.progress,
          status: goal.status,
          targetDate: dateStringFromOffset(-goal.targetDateDaysAhead),
        })),
      });
    }

    return { created: DEMO_STUDENTS.length };
  },
});

export const studentCount = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const students = await ctx.db.query("students").take(500);
    return students.length;
  },
});

export const addStudentData = internalMutation({
  args: {
    studentId: v.id("students"),
    skills: v.array(
      v.object({ stroke: v.string(), progress: v.number() }),
    ),
    attendance: v.array(
      v.object({
        date: v.string(),
        status: v.union(
          v.literal("present"),
          v.literal("late"),
          v.literal("absent"),
        ),
      }),
    ),
    sessions: v.array(
      v.object({
        date: v.string(),
        title: v.string(),
        durationMinutes: v.number(),
        strokes: v.array(v.string()),
        notes: v.string(),
      }),
    ),
    goals: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        target: v.string(),
        progress: v.number(),
        status: v.union(
          v.literal("not_started"),
          v.literal("in_progress"),
          v.literal("completed"),
        ),
        targetDate: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const skill of args.skills) {
      const existing = await ctx.db
        .query("strokeSkills")
        .withIndex("by_student_and_stroke", (q) =>
          q.eq("studentId", args.studentId).eq("stroke", skill.stroke),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("strokeSkills", existing._id, {
          progress: skill.progress,
          updatedAt: now,
        });
      }
    }
    for (const record of args.attendance) {
      await ctx.db.insert("attendance", {
        studentId: args.studentId,
        date: record.date,
        status: record.status,
        updatedAt: now,
      });
    }
    for (const session of args.sessions) {
      await ctx.db.insert("trainingSessions", {
        studentId: args.studentId,
        date: session.date,
        title: session.title,
        durationMinutes: session.durationMinutes,
        strokes: session.strokes,
        notes: session.notes,
        updatedAt: now,
      });
    }
    for (const goal of args.goals) {
      await ctx.db.insert("trainingGoals", {
        studentId: args.studentId,
        title: goal.title,
        description: goal.description,
        target: goal.target,
        progress: goal.progress,
        status: goal.status,
        targetDate: goal.targetDate,
        updatedAt: now,
      });
    }
    return null;
  },
});
