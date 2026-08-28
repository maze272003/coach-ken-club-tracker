import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
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
  distanceMeters?: number;
  intensity?: "easy" | "moderate" | "hard";
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
  type?: "manual" | "time" | "attendance";
  stroke?: string;
  distanceMeters?: number;
  course?: "short" | "long";
  targetTimeMs?: number;
  baselineBestMs?: number;
  targetAttendancePct?: number;
  target?: string;
  progress: number;
  status: "not_started" | "in_progress" | "completed" | "archived";
  targetDateDaysAhead: number;
  updatedDaysAgo: number;
};

type DemoTime = {
  daysAgo: number;
  stroke: string;
  distanceMeters: number;
  course: "short" | "long";
  timeMs: number;
  context: "practice" | "time_trial" | "meet";
  notes?: string;
};

type DemoStudent = {
  name: string;
  email: string;
  group: "Competitive" | "Development";
  dateOfBirth: string;
  sex: "M" | "F";
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  medicalNotes?: string;
  /**
   * Starting skill level (coach's baseline assessment). Final progress
   * is derived: starting level + 5 points per session that practiced
   * the skill — so progress visibly correlates with training volume.
   */
  startingSkills: Record<string, number>;
  days: DemoDay[];
  times: DemoTime[];
  goals: DemoGoal[];
};

const DEMO_STUDENTS: DemoStudent[] = [
  {
    name: "Alex Santos",
    email: "alex.santos@demo.swim",
    group: "Competitive",
    dateOfBirth: "2011-05-14",
    sex: "M",
    parentName: "Carlos Santos",
    parentPhone: "+1 555-0142",
    parentEmail: "carlos.santos@demo.swim",
    medicalNotes: "Mild asthma — keeps inhaler at poolside. No other restrictions.",
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
          distanceMeters: 3000,
          intensity: "hard",
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
          distanceMeters: 2800,
          intensity: "moderate",
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
          distanceMeters: 1800,
          intensity: "easy",
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
          distanceMeters: 3200,
          intensity: "moderate",
          skills: ["freestyle", "backstroke"],
          notes: "Improve breathing and body position.",
        },
      },
    ],
    times: [
      {
        daysAgo: 18,
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        timeMs: 28800,
        context: "time_trial",
        notes: "Solid start off blocks.",
      },
      {
        daysAgo: 12,
        stroke: "freestyle",
        distanceMeters: 100,
        course: "short",
        timeMs: 64500,
        context: "meet",
        notes: "Even split pacing.",
      },
      {
        daysAgo: 7,
        stroke: "butterfly",
        distanceMeters: 50,
        course: "short",
        timeMs: 31400,
        context: "practice",
      },
      {
        daysAgo: 5,
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        timeMs: 28200,
        context: "time_trial",
        notes: "Huge underwater breakout! New PB.",
      },
      {
        daysAgo: 1,
        stroke: "freestyle",
        distanceMeters: 100,
        course: "short",
        timeMs: 62100,
        context: "meet",
        notes: "District Championship Finals - 2.4s drop!",
      },
      {
        daysAgo: 1,
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        timeMs: 149800,
        context: "meet",
        notes: "First competitive 200 IM.",
      },
    ],
    goals: [
      {
        title: "Break 1:00 in 100m Free",
        description: "Targeting sub-1:00 100m freestyle in SCM at Regionals.",
        type: "time",
        stroke: "freestyle",
        distanceMeters: 100,
        course: "short",
        targetTimeMs: 60000,
        baselineBestMs: 64500,
        progress: 53,
        status: "in_progress",
        targetDateDaysAhead: 45,
        updatedDaysAgo: 1,
      },
      {
        title: "Sub-2:20 200m IM",
        description: "Build butterfly endurance to hold the IM pace through the final 50.",
        type: "time",
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        targetTimeMs: 140000,
        baselineBestMs: 149800,
        progress: 0,
        status: "not_started",
        targetDateDaysAhead: 90,
        updatedDaysAgo: 1,
      },
    ],
  },
  {
    name: "Maria Reyes",
    email: "maria.reyes@demo.swim",
    group: "Competitive",
    dateOfBirth: "2010-11-02",
    sex: "F",
    parentName: "Elena Reyes",
    parentPhone: "+1 555-0177",
    parentEmail: "elena.reyes@demo.swim",
    medicalNotes: "No known medical conditions.",
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
          distanceMeters: 2000,
          intensity: "moderate",
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
          distanceMeters: 3000,
          intensity: "hard",
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
          distanceMeters: 2200,
          intensity: "easy",
          skills: ["backstroke"],
          notes: "Hip rotation and streamline off the wall.",
        },
      },
      { daysAgo: 1, status: "absent" },
    ],
    times: [
      {
        daysAgo: 14,
        stroke: "butterfly",
        distanceMeters: 50,
        course: "long",
        timeMs: 33500,
        context: "time_trial",
      },
      {
        daysAgo: 9,
        stroke: "backstroke",
        distanceMeters: 100,
        course: "short",
        timeMs: 68500,
        context: "meet",
      },
      {
        daysAgo: 9,
        stroke: "backstroke",
        distanceMeters: 200,
        course: "short",
        timeMs: 148000,
        context: "meet",
      },
      {
        daysAgo: 5,
        stroke: "butterfly",
        distanceMeters: 50,
        course: "long",
        timeMs: 32100,
        context: "meet",
        notes: "Clean entry and strong finish.",
      },
      {
        daysAgo: 2,
        stroke: "backstroke",
        distanceMeters: 100,
        course: "short",
        timeMs: 66800,
        context: "time_trial",
        notes: "Fast flip turns.",
      },
    ],
    goals: [
      {
        title: "Sub-31.00 50m Fly (LCM)",
        description: "Build a consistent two-beat kick and clean breathing in 50m pool.",
        type: "time",
        stroke: "butterfly",
        distanceMeters: 50,
        course: "long",
        targetTimeMs: 31000,
        baselineBestMs: 33500,
        progress: 56,
        status: "in_progress",
        targetDateDaysAhead: 60,
        updatedDaysAgo: 5,
      },
      {
        title: "Complete 200m Backstroke Set",
        description: "Baseline endurance goal for the season.",
        type: "manual",
        target: "4x50m backstroke under 1:10 each",
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -10,
        updatedDaysAgo: 9,
      },
      {
        title: "Learn Butterfly Turns",
        description: "Older goal from last season, replaced by the fly speed goal.",
        type: "manual",
        target: "Legal open-turn and flip-turn transitions",
        progress: 40,
        status: "archived",
        targetDateDaysAhead: -30,
        updatedDaysAgo: 30,
      },
    ],
  },
  {
    name: "Daniel Cruz",
    email: "daniel.cruz@demo.swim",
    group: "Development",
    dateOfBirth: "2013-03-27",
    sex: "M",
    parentName: "Sofia Cruz",
    parentPhone: "+1 555-0193",
    parentEmail: "sofia.cruz@demo.swim",
    medicalNotes: "Nut allergy (EpiPen in first-aid kit). Ear tubes — avoid deep diving drills.",
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
          distanceMeters: 800,
          intensity: "easy",
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
          distanceMeters: 900,
          intensity: "easy",
          skills: ["breaststroke"],
          notes: "Timing of the pull-kick cycle.",
        },
      },
      { daysAgo: 2, status: "present" },
      { daysAgo: 1, status: "present" },
    ],
    times: [
      {
        daysAgo: 10,
        stroke: "breaststroke",
        distanceMeters: 50,
        course: "short",
        timeMs: 44500,
        context: "practice",
      },
      {
        daysAgo: 6,
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        timeMs: 36200,
        context: "practice",
      },
      {
        daysAgo: 3,
        stroke: "breaststroke",
        distanceMeters: 50,
        course: "short",
        timeMs: 42800,
        context: "time_trial",
        notes: "Great whip kick improvement!",
      },
    ],
    goals: [
      {
        title: "90% Practice Consistency",
        description: "Maintain regular attendance to build stamina.",
        type: "attendance",
        targetAttendancePct: 90,
        progress: 75,
        status: "in_progress",
        targetDateDaysAhead: 60,
        updatedDaysAgo: 1,
      },
    ],
  },
  {
    name: "Lily Wu",
    email: "lily.wu@demo.swim",
    group: "Development",
    dateOfBirth: "2012-08-19",
    sex: "F",
    parentName: "Wei Wu",
    parentPhone: "+1 555-0110",
    parentEmail: "wei.wu@demo.swim",
    startingSkills: {
      freestyle: 55,
      backstroke: 50,
      breaststroke: 40,
      butterfly: 25,
    },
    days: [
      { daysAgo: 20, status: "present" },
      { daysAgo: 18, status: "present" },
      {
        daysAgo: 16,
        status: "present",
        session: {
          title: "Streamline & Push-offs",
          durationMinutes: 45,
          distanceMeters: 1000,
          intensity: "easy",
          skills: ["freestyle", "backstroke"],
          notes: "Off-wall streamline hold, 5m breakout target.",
        },
      },
      { daysAgo: 14, status: "present" },
      { daysAgo: 12, status: "late" },
      {
        daysAgo: 11,
        status: "present",
        session: {
          title: "Backstroke Basics",
          durationMinutes: 45,
          distanceMeters: 1100,
          intensity: "moderate",
          skills: ["backstroke"],
          notes: "Straight-line backstroke with flags reference.",
        },
      },
      { daysAgo: 9, status: "present" },
      { daysAgo: 7, status: "absent" },
      {
        daysAgo: 6,
        status: "present",
        session: {
          title: "Freestyle Breathing",
          durationMinutes: 60,
          distanceMeters: 1400,
          intensity: "moderate",
          skills: ["freestyle"],
          notes: "Bilateral breathing every 3 strokes.",
        },
      },
      { daysAgo: 4, status: "present" },
      { daysAgo: 2, status: "present" },
      {
        daysAgo: 1,
        status: "present",
        session: {
          title: "Intro to IM Order",
          durationMinutes: 60,
          distanceMeters: 1500,
          intensity: "moderate",
          skills: ["butterfly", "backstroke", "breaststroke", "freestyle"],
          notes: "Swim the IM order in short 25m segments.",
        },
      },
    ],
    times: [
      {
        daysAgo: 11,
        stroke: "backstroke",
        distanceMeters: 50,
        course: "short",
        timeMs: 40900,
        context: "practice",
      },
      {
        daysAgo: 6,
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        timeMs: 34800,
        context: "time_trial",
        notes: "Much calmer breathing pattern.",
      },
      {
        daysAgo: 1,
        stroke: "im",
        distanceMeters: 100,
        course: "short",
        timeMs: 84200,
        context: "practice",
        notes: "First full 100 IM in training.",
      },
    ],
    goals: [
      {
        title: "Legal 100m IM",
        description: "Swim a legal 100m IM in a mini-meet by end of season.",
        type: "manual",
        target: "All four strokes with legal turns and finishes",
        progress: 25,
        status: "in_progress",
        targetDateDaysAhead: 45,
        updatedDaysAgo: 1,
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
  status: "planned" | "completed" | "cancelled";
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
    daysOffset: -8,
    title: "Breaststroke Kick Workshop",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 700,
    strokes: ["breaststroke"],
    notes: "Pool closure forced cancellation.",
    status: "cancelled",
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
          ...(demo.parentName ? { parentName: demo.parentName } : {}),
          ...(demo.parentPhone ? { parentPhone: demo.parentPhone } : {}),
          ...(demo.parentEmail ? { parentEmail: demo.parentEmail } : {}),
          ...(demo.medicalNotes ? { medicalNotes: demo.medicalNotes } : {}),
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
                  ...(day.session.distanceMeters !== undefined
                    ? { distanceMeters: day.session.distanceMeters }
                    : {}),
                  ...(day.session.intensity !== undefined
                    ? { intensity: day.session.intensity }
                    : {}),
                  strokes: day.session.skills,
                  notes: day.session.notes,
                },
              ]
            : [],
        ),
        times: demo.times.map((time) => ({
          date: dateStringFromOffset(time.daysAgo),
          stroke: time.stroke,
          distanceMeters: time.distanceMeters,
          course: time.course,
          timeMs: time.timeMs,
          context: time.context,
          notes: time.notes,
        })),
        goals: demo.goals.map((goal) => ({
          title: goal.title,
          description: goal.description,
          type: goal.type ?? "manual",
          stroke: goal.stroke,
          distanceMeters: goal.distanceMeters,
          course: goal.course,
          targetTimeMs: goal.targetTimeMs,
          baselineBestMs: goal.baselineBestMs,
          targetAttendancePct: goal.targetAttendancePct,
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
    async function upsert(name: string, description: string): Promise<Id<"groups">> {
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
        description,
        status: "active",
        updatedAt: Date.now(),
      });
    }
    return {
      competitiveId: await upsert(
        "Competitive",
        "Race squad — technique refinement, sprint and endurance sets for meet swimmers.",
      ),
      developmentId: await upsert(
        "Development",
        "Fundamentals — water comfort, stroke basics, and building practice habits.",
      ),
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
        status: v.union(
          v.literal("planned"),
          v.literal("completed"),
          v.literal("cancelled"),
        ),
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
 * Non-sensitive seed verification report for the CLI / data page:
 * table counts + which demo accounts exist. Safe to expose — the demo
 * emails are public knowledge in the repo and no personal data is
 * returned. Run with: npx convex run seed:status
 */
export const status = query({
  args: {},
  returns: v.object({
    counts: v.object({
      groups: v.number(),
      students: v.number(),
      activeStudents: v.number(),
      attendance: v.number(),
      trainingSessions: v.number(),
      timeResults: v.number(),
      trainingGoals: v.number(),
      strokeSkills: v.number(),
      practices: v.number(),
      practicesCompleted: v.number(),
      practicesPlanned: v.number(),
      practicesCancelled: v.number(),
    }),
    demoAccounts: v.array(
      v.object({
        email: v.string(),
        exists: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const count = async (
      table:
        | "groups"
        | "students"
        | "attendance"
        | "trainingSessions"
        | "timeResults"
        | "trainingGoals"
        | "strokeSkills"
        | "practices",
    ) => (await ctx.db.query(table).take(1000)).length;

    const students = await ctx.db.query("students").take(1000);
    const practices = await ctx.db.query("practices").take(1000);

    const demoEmails = DEMO_STUDENTS.map((demo) => demo.email);
    const users = await ctx.db.query("users").withIndex("email").take(1000);
    const existingEmails = new Set(
      users.filter((u) => u.email !== undefined).map((u) => u.email!),
    );

    return {
      counts: {
        groups: await count("groups"),
        students: students.length,
        activeStudents: students.filter((s) => s.status === "active").length,
        attendance: await count("attendance"),
        trainingSessions: await count("trainingSessions"),
        timeResults: await count("timeResults"),
        trainingGoals: await count("trainingGoals"),
        strokeSkills: await count("strokeSkills"),
        practices: practices.length,
        practicesCompleted: practices.filter((p) => p.status === "completed")
          .length,
        practicesPlanned: practices.filter((p) => p.status === "planned")
          .length,
        practicesCancelled: practices.filter((p) => p.status === "cancelled")
          .length,
      },
      demoAccounts: demoEmails.map((email) => ({
        email,
        exists: existingEmails.has(email),
      })),
    };
  },
});

/**
 * Removes ONLY the hardcoded @demo.swim accounts (their student
 * profile, attendance, skills, sessions, goals, times, and auth records).
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
  const times = await ctx.db
    .query("timeResults")
    .withIndex("by_student_and_date", (q) => q.eq("studentId", studentId))
    .take(1000);
  for (const doc of times) {
    await ctx.db.delete("timeResults", doc._id);
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

export const addStudentData = internalMutation({
  args: {
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
        distanceMeters: v.optional(v.number()),
        intensity: v.optional(
          v.union(
            v.literal("easy"),
            v.literal("moderate"),
            v.literal("hard"),
          ),
        ),
        strokes: v.array(v.string()),
        notes: v.string(),
      }),
    ),
    times: v.array(
      v.object({
        date: v.string(),
        stroke: v.string(),
        distanceMeters: v.number(),
        course: v.union(v.literal("short"), v.literal("long")),
        timeMs: v.number(),
        context: v.union(
          v.literal("practice"),
          v.literal("time_trial"),
          v.literal("meet"),
        ),
        notes: v.optional(v.string()),
      }),
    ),
    goals: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        type: v.optional(
          v.union(
            v.literal("manual"),
            v.literal("time"),
            v.literal("attendance"),
          ),
        ),
        stroke: v.optional(v.string()),
        distanceMeters: v.optional(v.number()),
        course: v.optional(v.union(v.literal("short"), v.literal("long"))),
        targetTimeMs: v.optional(v.number()),
        baselineBestMs: v.optional(v.number()),
        targetAttendancePct: v.optional(v.number()),
        target: v.optional(v.string()),
        progress: v.number(),
        status: v.union(
          v.literal("not_started"),
          v.literal("in_progress"),
          v.literal("completed"),
          v.literal("archived"),
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
        ...(session.distanceMeters !== undefined
          ? { distanceMeters: session.distanceMeters }
          : {}),
        ...(session.intensity !== undefined
          ? { intensity: session.intensity }
          : {}),
        strokes: session.strokes,
        notes: session.notes,
        updatedAt: endOfDay(session.date),
      });
    }
    for (const time of args.times) {
      await ctx.db.insert("timeResults", {
        studentId: args.studentId,
        date: time.date,
        stroke: time.stroke,
        distanceMeters: time.distanceMeters,
        course: time.course,
        timeMs: time.timeMs,
        context: time.context,
        notes: time.notes,
        updatedAt: endOfDay(time.date),
      });
    }
    for (const goal of args.goals) {
      await ctx.db.insert("trainingGoals", {
        studentId: args.studentId,
        title: goal.title,
        description: goal.description,
        type: goal.type ?? "manual",
        stroke: goal.stroke,
        distanceMeters: goal.distanceMeters,
        course: goal.course,
        targetTimeMs: goal.targetTimeMs,
        baselineBestMs: goal.baselineBestMs,
        targetAttendancePct: goal.targetAttendancePct,
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
