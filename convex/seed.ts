import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertExistingSkillKeys } from "./skills";
import { assertProgress } from "./lib/validation";

const DEMO_PASSWORD = "swim-demo-2026";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROGRESS_PER_SESSION = 5;
const JOINED_AT_DAYS_AGO = 90;

type DemoSession = {
  title: string;
  durationMinutes: number;
  skills: string[];
  notes: string;
};

/**
 * One training day on the calendar. A session may only exist on a day
 * the student attended (present or late) — addStudentData enforces it.
 */
type DemoDay = {
  daysAgo: number;
  status: "present" | "late" | "absent";
  session?: DemoSession;
};

type DemoGoal = {
  title: string;
  description: string;
  target: string;
  progress: number;
  status: "not_started" | "in_progress" | "completed";
  targetDateDaysAhead: number;
  updatedDaysAgo: number;
};

type DemoStudent = {
  name: string;
  email: string;
  group: "Competitive" | "Development";
  dateOfBirth: string;
  sex: "M" | "F";
  /**
   * Starting skill level (coach's baseline assessment). Final progress
   * is derived: starting level + 5 points per session that practiced
   * the skill — so progress visibly correlates with training volume.
   */
  startingSkills: Record<string, number>;
  days: DemoDay[];
  goals: DemoGoal[];
};

const DEMO_STUDENTS: DemoStudent[] = [
  {
    name: "Alex Santos",
    email: "alex.santos@demo.swim",
    group: "Competitive",
    dateOfBirth: "2011-05-14",
    sex: "M",
    startingSkills: {
      freestyle: 60,
      backstroke: 55,
      breaststroke: 45,
      butterfly: 30,
    },
    days: [
      { daysAgo: 20, status: "present" },
      { daysAgo: 18, status: "present" },
      { daysAgo: 16, status: "present" },
      { daysAgo: 14, status: "late" },
      {
        daysAgo: 12,
        status: "present",
        session: {
          title: "IM Prep",
          durationMinutes: 90,
          skills: ["freestyle", "backstroke", "breaststroke", "butterfly"],
          notes: "Transition work between strokes.",
        },
      },
      { daysAgo: 10, status: "present" },
      { daysAgo: 8, status: "absent" },
      {
        daysAgo: 7,
        status: "present",
        session: {
          title: "Endurance Set",
          durationMinutes: 75,
          skills: ["freestyle", "breaststroke"],
          notes: "4x200m negative split.",
        },
      },
      { daysAgo: 5, status: "present" },
      {
        daysAgo: 4,
        status: "late",
        session: {
          title: "Freestyle Technique",
          durationMinutes: 60,
          skills: ["freestyle"],
          notes: "Focus on stroke length and catch.",
        },
      },
      { daysAgo: 2, status: "present" },
      {
        daysAgo: 1,
        status: "present",
        session: {
          title: "Freestyle & Backstroke",
          durationMinutes: 90,
          skills: ["freestyle", "backstroke"],
          notes: "Improve breathing and body position.",
        },
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
        updatedDaysAgo: 2,
      },
    ],
  },
  {
    name: "Maria Reyes",
    email: "maria.reyes@demo.swim",
    group: "Competitive",
    dateOfBirth: "2010-11-02",
    sex: "F",
    startingSkills: {
      freestyle: 60,
      backstroke: 60,
      breaststroke: 55,
      butterfly: 40,
    },
    days: [
      { daysAgo: 20, status: "present" },
      { daysAgo: 18, status: "late" },
      { daysAgo: 16, status: "present" },
      { daysAgo: 14, status: "present" },
      { daysAgo: 12, status: "present" },
      { daysAgo: 10, status: "present" },
      {
        daysAgo: 9,
        status: "present",
        session: {
          title: "Kick & Pull Set",
          durationMinutes: 60,
          skills: ["backstroke", "freestyle"],
          notes: "Kick board and pull buoy alternating sets.",
        },
      },
      { daysAgo: 7, status: "present" },
      {
        daysAgo: 5,
        status: "present",
        session: {
          title: "IM Prep",
          durationMinutes: 90,
          skills: ["butterfly", "backstroke", "breaststroke", "freestyle"],
          notes: "Transition work between strokes.",
        },
      },
      { daysAgo: 4, status: "late" },
      {
        daysAgo: 2,
        status: "present",
        session: {
          title: "Backstroke Focus",
          durationMinutes: 60,
          skills: ["backstroke"],
          notes: "Hip rotation and streamline off the wall.",
        },
      },
      { daysAgo: 1, status: "absent" },
    ],
    goals: [
      {
        title: "Master Butterfly Technique",
        description: "Build a consistent two-beat kick and clean breathing.",
        target: "Swim 50m butterfly without stopping",
        progress: 45,
        status: "in_progress",
        targetDateDaysAhead: 60,
        updatedDaysAgo: 3,
      },
      {
        title: "Complete 200m Backstroke Set",
        description: "Baseline endurance goal for the season.",
        target: "4x50m backstroke under 1:10 each",
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -10,
        updatedDaysAgo: 9,
      },
    ],
  },
  {
    name: "Daniel Cruz",
    email: "daniel.cruz@demo.swim",
    group: "Development",
    dateOfBirth: "2013-03-27",
    sex: "M",
    startingSkills: {
      freestyle: 50,
      backstroke: 40,
      breaststroke: 60,
      butterfly: 20,
    },
    days: [
      { daysAgo: 20, status: "absent" },
      { daysAgo: 18, status: "present" },
      { daysAgo: 16, status: "late" },
      { daysAgo: 14, status: "present" },
      { daysAgo: 12, status: "absent" },
      {
        daysAgo: 10,
        status: "present",
        session: {
          title: "Water Comfort & Kicks",
          durationMinutes: 45,
          skills: ["freestyle", "breaststroke"],
          notes: "Kickboard drills and breathing rhythm.",
        },
      },
      { daysAgo: 8, status: "present" },
      { daysAgo: 6, status: "present" },
      { daysAgo: 4, status: "absent" },
      {
        daysAgo: 3,
        status: "late",
        session: {
          title: "Breaststroke Fundamentals",
          durationMinutes: 45,
          skills: ["breaststroke"],
          notes: "Timing of the pull-kick cycle.",
        },
      },
      { daysAgo: 2, status: "present" },
      { daysAgo: 1, status: "present" },
    ],
    goals: [
      {
        title: "Learn Legal Butterfly",
        description: "Start from basics: dolphin kick and single-arm drills.",
        target: "Complete 25m butterfly with legal form",
        progress: 20,
        status: "in_progress",
        targetDateDaysAhead: 90,
        updatedDaysAgo: 5,
      },
    ],
  },
];

type DemoPractice = {
  groupName: string;
  daysOffset: number; // negative = past
  title: string;
  startTime: string;
  plannedDurationMinutes: number;
  plannedDistanceMeters: number;
  strokes: string[];
  notes: string;
  status: "planned" | "completed";
};

// Dates chosen so both Competitive swimmers were present on the
// completed practice days (daysAgo 12 and 5 in their demo days).
const DEMO_PRACTICES: DemoPractice[] = [
  {
    groupName: "Competitive",
    daysOffset: -12,
    title: "IM Prep",
    startTime: "17:30",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3000,
    strokes: ["freestyle", "backstroke", "breaststroke", "butterfly"],
    notes: "Transition work between strokes.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: -5,
    title: "Endurance Set",
    startTime: "18:00",
    plannedDurationMinutes: 75,
    plannedDistanceMeters: 2800,
    strokes: ["freestyle", "breaststroke"],
    notes: "4x200m negative split.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: 1,
    title: "Sprint Fundamentals",
    startTime: "17:30",
    plannedDurationMinutes: 60,
    plannedDistanceMeters: 2000,
    strokes: ["freestyle"],
    notes: "8x50 all-out on 2:30.",
    status: "planned",
  },
  {
    groupName: "Development",
    daysOffset: 2,
    title: "Water Comfort & Kicks",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 800,
    strokes: ["freestyle", "breaststroke"],
    notes: "Kickboard drills and breathing rhythm.",
    status: "planned",
  },
];

function dateStringFromOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Seeds demo data. Refuses to run if any demo account already exists
 * (run seed:resetDemo first to replace them). Other students and the
 * coach login are left untouched.
 * Run with: npx convex run seed:seed
 *
 * Relations guaranteed by the data below (and enforced in
 * addStudentData):
 * - every training session is on a day with present/late attendance
 * - every skill referenced exists in the skills catalog
 * - skill progress = starting level + 5 per session practicing it
 * - completed goals have 100% progress and a past target date
 */
export const seed = action({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx): Promise<{ created: number }> => {
    const emails = DEMO_STUDENTS.map((demo) => demo.email);
    const taken: boolean = await ctx.runQuery(internal.seed.demoUsersExist, {
      emails,
    });
    if (taken) {
      throw new ConvexError(
        "Demo students already exist — run seed:resetDemo to replace them.",
      );
    }

    await ctx.runMutation(internal.skills.backfill, {});
    const groupIds = await ctx.runMutation(internal.seed.upsertDemoGroups, {});

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
        {
          userId: created.user._id,
          status: "active",
          groupId:
            demo.group === "Development"
              ? groupIds.developmentId
              : groupIds.competitiveId,
          dateOfBirth: demo.dateOfBirth,
          sex: demo.sex,
          joinedAt: dateStringFromOffset(JOINED_AT_DAYS_AGO),
        },
      );

      const sessionCounts = new Map<string, number>();
      for (const day of demo.days) {
        if (!day.session) continue;
        for (const key of day.session.skills) {
          sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1);
        }
      }

      await ctx.runMutation(internal.seed.addStudentData, {
        studentId,
        skills: Object.entries(demo.startingSkills).map(([key, base]) => ({
          key,
          progress: Math.min(
            95,
            base + PROGRESS_PER_SESSION * (sessionCounts.get(key) ?? 0),
          ),
        })),
        attendance: demo.days.map((day) => ({
          date: dateStringFromOffset(day.daysAgo),
          status: day.status,
        })),
        sessions: demo.days.flatMap((day) =>
          day.session
            ? [
                {
                  date: dateStringFromOffset(day.daysAgo),
                  title: day.session.title,
                  durationMinutes: day.session.durationMinutes,
                  strokes: day.session.skills,
                  notes: day.session.notes,
                },
              ]
            : [],
        ),
        goals: demo.goals.map((goal) => ({
          title: goal.title,
          description: goal.description,
          target: goal.target,
          progress: goal.progress,
          status: goal.status,
          targetDate: dateStringFromOffset(-goal.targetDateDaysAhead),
          updatedDaysAgo: goal.updatedDaysAgo,
        })),
      });
    }

    await ctx.runMutation(internal.seed.addDemoPractices, {
      practices: DEMO_PRACTICES.map((practice) => ({
        groupId:
          practice.groupName === "Development"
            ? groupIds.developmentId
            : groupIds.competitiveId,
        date: dateStringFromOffset(-practice.daysOffset),
        startTime: practice.startTime,
        title: practice.title,
        plannedDurationMinutes: practice.plannedDurationMinutes,
        plannedDistanceMeters: practice.plannedDistanceMeters,
        strokes: practice.strokes,
        notes: practice.notes,
        status: practice.status,
      })),
    });

    return { created: DEMO_STUDENTS.length };
  },
});

export const upsertDemoGroups = internalMutation({
  args: {},
  returns: v.object({
    competitiveId: v.id("groups"),
    developmentId: v.id("groups"),
  }),
  handler: async (ctx) => {
    async function upsert(name: string): Promise<Id<"groups">> {
      const groups = await ctx.db
        .query("groups")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(500);
      const existing = groups.find(
        (g) => g.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing._id;
      return ctx.db.insert("groups", {
        name,
        status: "active",
        updatedAt: Date.now(),
      });
    }
    return {
      competitiveId: await upsert("Competitive"),
      developmentId: await upsert("Development"),
    };
  },
});

export const addDemoPractices = internalMutation({
  args: {
    practices: v.array(
      v.object({
        groupId: v.id("groups"),
        date: v.string(),
        startTime: v.string(),
        title: v.string(),
        plannedDurationMinutes: v.number(),
        plannedDistanceMeters: v.number(),
        strokes: v.array(v.string()),
        notes: v.string(),
        status: v.union(v.literal("planned"), v.literal("completed")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const practice of args.practices) {
      const endOfDay = Date.parse(`${practice.date}T17:00:00Z`);
      await ctx.db.insert("practices", {
        ...practice,
        ...(practice.status === "completed"
          ? {
              completedAt: endOfDay,
              actualDurationMinutes: practice.plannedDurationMinutes,
              actualDistanceMeters: practice.plannedDistanceMeters,
            }
          : {}),
        updatedAt: endOfDay,
      });
    }
    return null;
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

export const demoUsersExist = internalQuery({
  args: { emails: v.array(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const emailSet = new Set(args.emails);
    const users = await ctx.db.query("users").withIndex("email").take(1000);
    return users.some((user) => user.email !== undefined && emailSet.has(user.email));
  },
});

export const findUserIdByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), v.id("users")),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    return user?._id ?? null;
  },
});

/**
 * Removes ONLY the hardcoded @demo.swim accounts (their student
 * profile, attendance, skills, sessions, goals, and auth records).
 * Coach logins and manually created students are untouched.
 * Run with: npx convex run seed:resetDemo
 */
export const resetDemo = action({
  args: {},
  returns: v.object({
    removedStudents: v.number(),
    remainingStudents: v.number(),
  }),
  handler: async (ctx): Promise<{
    removedStudents: number;
    remainingStudents: number;
  }> => {
    await ctx.runMutation(internal.seed.deleteDemoGroupsAndPractices, {});
    let removed = 0;
    for (const email of DEMO_STUDENTS.map((demo) => demo.email)) {
      const userId: string | null = await ctx.runQuery(
        internal.seed.findUserIdByEmail,
        { email },
      );
      if (userId === null) continue;
      await ctx.runMutation(internal.seed.deleteUserCascade, {
        userId: userId as never,
      });
      removed += 1;
    }
    const remaining: number = await ctx.runQuery(
      internal.seed.studentCount,
      {},
    );
    return { removedStudents: removed, remainingStudents: remaining };
  },
});

async function deleteStudentData(ctx: MutationCtx, studentId: Id<"students">) {
  const attendance = await ctx.db
    .query("attendance")
    .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
    .take(1000);
  for (const doc of attendance) {
    await ctx.db.delete("attendance", doc._id);
  }
  const skills = await ctx.db
    .query("strokeSkills")
    .withIndex("by_student_and_stroke", (q) => q.eq("studentId", studentId))
    .take(1000);
  for (const doc of skills) {
    await ctx.db.delete("strokeSkills", doc._id);
  }
  const sessions = await ctx.db
    .query("trainingSessions")
    .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
    .take(1000);
  for (const doc of sessions) {
    await ctx.db.delete("trainingSessions", doc._id);
  }
  const goals = await ctx.db
    .query("trainingGoals")
    .withIndex("by_student_and_updated", (q) => q.eq("studentId", studentId))
    .take(1000);
  for (const doc of goals) {
    await ctx.db.delete("trainingGoals", doc._id);
  }
}

export const deleteUserCascade = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (student) {
      await deleteStudentData(ctx, student._id);
      await ctx.db.delete("students", student._id);
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .take(100);
    for (const session of sessions) {
      let tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .take(100);
      while (tokens.length > 0) {
        for (const token of tokens) {
          await ctx.db.delete("authRefreshTokens", token._id);
        }
        tokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .take(100);
      }
      await ctx.db.delete("authSessions", session._id);
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .take(100);
    for (const account of accounts) {
      await ctx.db.delete("authAccounts", account._id);
    }

    await ctx.db.delete("users", args.userId);
    return null;
  },
});

/**
 * Internal: removes the demo groups ("Competitive"/"Development") and
 * every practice scheduled for them. Manually created groups and
 * practices for other groups are untouched.
 */
export const deleteDemoGroupsAndPractices = internalMutation({
  args: {},
  returns: v.object({ removedPractices: v.number(), removedGroups: v.number() }),
  handler: async (ctx) => {
    const groups = await ctx.db.query("groups").take(500);
    const demoNames = new Set(["competitive", "development"]);
    const demoGroups = groups.filter((g) =>
      demoNames.has(g.name.trim().toLowerCase()),
    );
    let removedPractices = 0;
    for (const group of demoGroups) {
      const practices = await ctx.db
        .query("practices")
        .withIndex("by_group_and_date", (q) => q.eq("groupId", group._id))
        .take(1000);
      for (const practice of practices) {
        await ctx.db.delete("practices", practice._id);
        removedPractices += 1;
      }
      await ctx.db.delete("groups", group._id);
    }
    return { removedPractices, removedGroups: demoGroups.length };
  },
});

export const addStudentData = internalMutation({  args: {
    studentId: v.id("students"),
    skills: v.array(
      v.object({ key: v.string(), progress: v.number() }),
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
        updatedDaysAgo: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Evening timestamp for a date string, so records keep a stable,
    // realistic ordering within each day.
    const endOfDay = (date: string) => Date.parse(`${date}T17:00:00Z`);

    const attendedDates = new Set(
      args.attendance
        .filter((record) => record.status !== "absent")
        .map((record) => record.date),
    );

    for (const skill of args.skills) {
      assertProgress(skill.progress);
      await assertExistingSkillKeys(ctx, [skill.key]);
    }
    for (const session of args.sessions) {
      await assertExistingSkillKeys(ctx, session.strokes);
      if (!attendedDates.has(session.date)) {
        throw new ConvexError(
          `Session "${session.title}" (${session.date}) is on a day without recorded attendance`,
        );
      }
    }
    for (const goal of args.goals) {
      if (goal.status === "completed" && goal.progress !== 100) {
        throw new ConvexError(`Completed goal "${goal.title}" must be 100%`);
      }
    }

    // A skill's last-update time = the most recent session that
    // practiced it, so progress visibly lines up with training days.
    const lastPracticedMs = new Map<string, number>();
    for (const session of args.sessions) {
      const ms = endOfDay(session.date);
      for (const key of session.strokes) {
        lastPracticedMs.set(key, Math.max(lastPracticedMs.get(key) ?? 0, ms));
      }
    }

    for (const skill of args.skills) {
      await ctx.db.insert("strokeSkills", {
        studentId: args.studentId,
        stroke: skill.key,
        progress: skill.progress,
        updatedAt: lastPracticedMs.get(skill.key) ?? Date.now(),
      });
    }
    for (const record of args.attendance) {
      await ctx.db.insert("attendance", {
        studentId: args.studentId,
        date: record.date,
        status: record.status,
        updatedAt: endOfDay(record.date),
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
        updatedAt: endOfDay(session.date),
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
        updatedAt: Date.now() - goal.updatedDaysAgo * DAY_MS,
      });
    }
    return null;
  },
});
