import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertExistingSkillKeys } from "./skills";
import { assertProgress } from "./lib/validation";

export const DEMO_PASSWORD = "swim-demo-2026";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROGRESS_PER_SESSION = 4;
const JOINED_AT_DAYS_AGO = 120;

type DemoSession = {
  title: string;
  durationMinutes: number;
  distanceMeters?: number;
  intensity?: "easy" | "moderate" | "hard";
  skills: string[];
  notes: string;
};

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
  startingSkills: Record<string, number>;
  days: DemoDay[];
  times: DemoTime[];
  goals: DemoGoal[];
};

export const DEMO_STUDENTS: DemoStudent[] = [
  // 1. Alex Santos (Competitive - IM / Free specialist)
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
      freestyle: 70,
      backstroke: 65,
      breaststroke: 55,
      butterfly: 50,
      im: 60,
    },
    days: [
      { daysAgo: 24, status: "present" },
      { daysAgo: 22, status: "present" },
      { daysAgo: 20, status: "present" },
      { daysAgo: 18, status: "present" },
      { daysAgo: 16, status: "present" },
      { daysAgo: 14, status: "late" },
      {
        daysAgo: 12,
        status: "present",
        session: {
          title: "IM Prep & Transitions",
          durationMinutes: 90,
          distanceMeters: 3000,
          intensity: "hard",
          skills: ["freestyle", "backstroke", "breaststroke", "butterfly", "im"],
          notes: "Fast turnarounds and breakout power.",
        },
      },
      { daysAgo: 10, status: "present" },
      { daysAgo: 8, status: "present" },
      {
        daysAgo: 7,
        status: "present",
        session: {
          title: "Endurance Threshold",
          durationMinutes: 75,
          distanceMeters: 2800,
          intensity: "moderate",
          skills: ["freestyle", "breaststroke"],
          notes: "4x200m negative split pacing.",
        },
      },
      { daysAgo: 5, status: "present" },
      {
        daysAgo: 4,
        status: "late",
        session: {
          title: "Speed Work & Starts",
          durationMinutes: 60,
          distanceMeters: 2000,
          intensity: "hard",
          skills: ["freestyle"],
          notes: "Dive off blocks, clean 15m breakout.",
        },
      },
      { daysAgo: 2, status: "present" },
      {
        daysAgo: 1,
        status: "present",
        session: {
          title: "Race Pace Simulation",
          durationMinutes: 90,
          distanceMeters: 3200,
          intensity: "moderate",
          skills: ["freestyle", "backstroke", "im"],
          notes: "Targeting even pacing through final 50m.",
        },
      },
    ],
    times: [
      { daysAgo: 24, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 28800, context: "time_trial", notes: "Season opener trial." },
      { daysAgo: 18, stroke: "freestyle", distanceMeters: 100, course: "short", timeMs: 64500, context: "meet", notes: "Controlled split." },
      { daysAgo: 14, stroke: "butterfly", distanceMeters: 50, course: "short", timeMs: 31400, context: "practice" },
      { daysAgo: 8, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 27900, context: "time_trial", notes: "New PB! Fast reaction." },
      { daysAgo: 5, stroke: "im", distanceMeters: 200, course: "short", timeMs: 148500, context: "meet", notes: "Sub-2:30 club championship." },
      { daysAgo: 1, stroke: "freestyle", distanceMeters: 100, course: "short", timeMs: 61800, context: "meet", notes: "2.7s drop! District Finals." },
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
        progress: 60,
        status: "in_progress",
        targetDateDaysAhead: 45,
        updatedDaysAgo: 1,
      },
      {
        title: "Sub-2:25 200m IM",
        description: "Build butterfly endurance to hold the IM pace through breaststroke.",
        type: "time",
        stroke: "im",
        distanceMeters: 200,
        course: "short",
        targetTimeMs: 145000,
        baselineBestMs: 148500,
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -5,
        updatedDaysAgo: 5,
      },
      {
        title: "90% Practice Consistency",
        description: "Stay dedicated to weekday and Saturday practices.",
        type: "attendance",
        targetAttendancePct: 90,
        progress: 92,
        status: "in_progress",
        targetDateDaysAhead: 60,
        updatedDaysAgo: 2,
      },
    ],
  },

  // 2. Maria Reyes (Competitive - Backstroke / Fly specialist)
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
      freestyle: 70,
      backstroke: 75,
      breaststroke: 60,
      butterfly: 65,
      im: 65,
    },
    days: [
      { daysAgo: 23, status: "present" },
      { daysAgo: 21, status: "late" },
      { daysAgo: 19, status: "present" },
      { daysAgo: 17, status: "present" },
      { daysAgo: 15, status: "present" },
      {
        daysAgo: 12,
        status: "present",
        session: {
          title: "Backstroke Rotation & Tempo",
          durationMinutes: 75,
          distanceMeters: 2600,
          intensity: "hard",
          skills: ["backstroke", "freestyle"],
          notes: "Consistent stroke count per 50m.",
        },
      },
      { daysAgo: 10, status: "present" },
      { daysAgo: 8, status: "present" },
      {
        daysAgo: 6,
        status: "present",
        session: {
          title: "Fly Kick & Power Set",
          durationMinutes: 90,
          distanceMeters: 3100,
          intensity: "hard",
          skills: ["butterfly", "im"],
          notes: "Underwater fly kick power development.",
        },
      },
      { daysAgo: 4, status: "late" },
      {
        daysAgo: 2,
        status: "present",
        session: {
          title: "Sprint Tuning",
          durationMinutes: 60,
          distanceMeters: 2200,
          intensity: "moderate",
          skills: ["backstroke", "butterfly"],
          notes: "Fast breakout speed.",
        },
      },
      { daysAgo: 1, status: "present" },
    ],
    times: [
      { daysAgo: 22, stroke: "butterfly", distanceMeters: 50, course: "long", timeMs: 33500, context: "time_trial" },
      { daysAgo: 17, stroke: "backstroke", distanceMeters: 100, course: "short", timeMs: 68500, context: "meet" },
      { daysAgo: 12, stroke: "backstroke", distanceMeters: 200, course: "short", timeMs: 148000, context: "meet", notes: "Negative split second 100m." },
      { daysAgo: 6, stroke: "butterfly", distanceMeters: 50, course: "long", timeMs: 31800, context: "meet", notes: "New PB! Clean surface entry." },
      { daysAgo: 2, stroke: "backstroke", distanceMeters: 100, course: "short", timeMs: 66200, context: "time_trial", notes: "Great turn acceleration." },
    ],
    goals: [
      {
        title: "Sub-31.00 50m Fly (LCM)",
        description: "Build continuous two-beat kick and clean entry in 50m long course.",
        type: "time",
        stroke: "butterfly",
        distanceMeters: 50,
        course: "long",
        targetTimeMs: 31000,
        baselineBestMs: 33500,
        progress: 68,
        status: "in_progress",
        targetDateDaysAhead: 50,
        updatedDaysAgo: 6,
      },
      {
        title: "Complete 200m Backstroke Target",
        description: "Sub-2:25 in short course 200m Back.",
        type: "time",
        stroke: "backstroke",
        distanceMeters: 200,
        course: "short",
        targetTimeMs: 145000,
        baselineBestMs: 148000,
        progress: 80,
        status: "in_progress",
        targetDateDaysAhead: 30,
        updatedDaysAgo: 2,
      },
    ],
  },

  // 3. Jordan Miller (Competitive - Breaststroke & IM Powerhouse)
  {
    name: "Jordan Miller",
    email: "jordan.miller@demo.swim",
    group: "Competitive",
    dateOfBirth: "2009-08-21",
    sex: "M",
    parentName: "Sarah Miller",
    parentPhone: "+1 555-0231",
    parentEmail: "sarah.miller@demo.swim",
    medicalNotes: "History of shoulder fatigue (monitored warmups).",
    startingSkills: {
      freestyle: 75,
      backstroke: 60,
      breaststroke: 85,
      butterfly: 55,
      im: 75,
    },
    days: [
      { daysAgo: 25, status: "present" },
      { daysAgo: 23, status: "present" },
      { daysAgo: 21, status: "present" },
      { daysAgo: 19, status: "present" },
      {
        daysAgo: 16,
        status: "present",
        session: {
          title: "Breaststroke Power & Pull",
          durationMinutes: 90,
          distanceMeters: 3400,
          intensity: "hard",
          skills: ["breaststroke", "freestyle"],
          notes: "Power rack sets with resistance cord.",
        },
      },
      { daysAgo: 14, status: "present" },
      { daysAgo: 12, status: "late" },
      { daysAgo: 9, status: "present" },
      {
        daysAgo: 7,
        status: "present",
        session: {
          title: "IM Speed & Turns",
          durationMinutes: 80,
          distanceMeters: 2900,
          intensity: "hard",
          skills: ["im", "breaststroke"],
          notes: "Back-to-breast crossover turns.",
        },
      },
      { daysAgo: 5, status: "present" },
      {
        daysAgo: 3,
        status: "present",
        session: {
          title: "Sprint Sets 50s",
          durationMinutes: 70,
          distanceMeters: 2400,
          intensity: "moderate",
          skills: ["breaststroke", "freestyle"],
          notes: "8x50m on 1:15 holding sub-33s.",
        },
      },
      { daysAgo: 1, status: "present" },
    ],
    times: [
      { daysAgo: 25, stroke: "breaststroke", distanceMeters: 50, course: "short", timeMs: 31800, context: "time_trial" },
      { daysAgo: 19, stroke: "breaststroke", distanceMeters: 100, course: "short", timeMs: 69200, context: "meet" },
      { daysAgo: 14, stroke: "im", distanceMeters: 200, course: "short", timeMs: 142000, context: "meet" },
      { daysAgo: 7, stroke: "breaststroke", distanceMeters: 50, course: "short", timeMs: 30500, context: "meet", notes: "Team Record! Blistering finish." },
      { daysAgo: 3, stroke: "breaststroke", distanceMeters: 100, course: "short", timeMs: 67200, context: "time_trial", notes: "Dropped 2 full seconds." },
    ],
    goals: [
      {
        title: "Sub-1:06 in 100m Breast",
        description: "National Junior Championship qualifying mark.",
        type: "time",
        stroke: "breaststroke",
        distanceMeters: 100,
        course: "short",
        targetTimeMs: 66000,
        baselineBestMs: 69200,
        progress: 62,
        status: "in_progress",
        targetDateDaysAhead: 40,
        updatedDaysAgo: 3,
      },
    ],
  },

  // 4. Chloe Zhao (Competitive - Distance Free & Fly)
  {
    name: "Chloe Zhao",
    email: "chloe.zhao@demo.swim",
    group: "Competitive",
    dateOfBirth: "2012-02-17",
    sex: "F",
    parentName: "David Zhao",
    parentPhone: "+1 555-0284",
    parentEmail: "david.zhao@demo.swim",
    startingSkills: {
      freestyle: 80,
      backstroke: 65,
      breaststroke: 50,
      butterfly: 70,
      im: 65,
    },
    days: [
      { daysAgo: 24, status: "present" },
      { daysAgo: 22, status: "present" },
      { daysAgo: 20, status: "present" },
      {
        daysAgo: 17,
        status: "present",
        session: {
          title: "Aerobic Threshold & Distance",
          durationMinutes: 90,
          distanceMeters: 3800,
          intensity: "hard",
          skills: ["freestyle"],
          notes: "3x800m holding stroke count.",
        },
      },
      { daysAgo: 15, status: "present" },
      { daysAgo: 13, status: "present" },
      { daysAgo: 10, status: "late" },
      {
        daysAgo: 8,
        status: "present",
        session: {
          title: "Butterfly Aerobic & Pacing",
          durationMinutes: 80,
          distanceMeters: 3200,
          intensity: "moderate",
          skills: ["butterfly", "freestyle"],
          notes: "Breathing every 2 strokes consistently.",
        },
      },
      { daysAgo: 6, status: "present" },
      { daysAgo: 3, status: "present" },
      {
        daysAgo: 1,
        status: "present",
        session: {
          title: "Race Strategy & Split Pacing",
          durationMinutes: 75,
          distanceMeters: 2900,
          intensity: "moderate",
          skills: ["freestyle", "im"],
          notes: "Simulating 400m race split.",
        },
      },
    ],
    times: [
      { daysAgo: 22, stroke: "freestyle", distanceMeters: 200, course: "short", timeMs: 136000, context: "meet" },
      { daysAgo: 15, stroke: "freestyle", distanceMeters: 400, course: "short", timeMs: 284000, context: "meet" },
      { daysAgo: 8, stroke: "butterfly", distanceMeters: 100, course: "short", timeMs: 69800, context: "time_trial" },
      { daysAgo: 1, stroke: "freestyle", distanceMeters: 400, course: "short", timeMs: 278000, context: "meet", notes: "PB! 6-second drop." },
    ],
    goals: [
      {
        title: "Sub-4:35 400m Free",
        description: "Targeting top 3 seed at upcoming Invitational.",
        type: "time",
        stroke: "freestyle",
        distanceMeters: 400,
        course: "short",
        targetTimeMs: 275000,
        baselineBestMs: 284000,
        progress: 67,
        status: "in_progress",
        targetDateDaysAhead: 45,
        updatedDaysAgo: 1,
      },
    ],
  },

  // 5. Ethan Campbell (Competitive - Sprint Free & Back)
  {
    name: "Ethan Campbell",
    email: "ethan.campbell@demo.swim",
    group: "Competitive",
    dateOfBirth: "2011-09-05",
    sex: "M",
    parentName: "Laura Campbell",
    parentPhone: "+1 555-0319",
    parentEmail: "laura.campbell@demo.swim",
    medicalNotes: "Prescription goggles used during competition.",
    startingSkills: {
      freestyle: 80,
      backstroke: 75,
      breaststroke: 45,
      butterfly: 50,
      im: 60,
    },
    days: [
      { daysAgo: 24, status: "present" },
      { daysAgo: 22, status: "present" },
      { daysAgo: 19, status: "late" },
      {
        daysAgo: 16,
        status: "present",
        session: {
          title: "Sprint Dynamics & Starts",
          durationMinutes: 75,
          distanceMeters: 2500,
          intensity: "hard",
          skills: ["freestyle", "backstroke"],
          notes: "Relay takeoffs and explosive turn off wall.",
        },
      },
      { daysAgo: 14, status: "present" },
      { daysAgo: 11, status: "present" },
      { daysAgo: 9, status: "present" },
      {
        daysAgo: 6,
        status: "present",
        session: {
          title: "Backstroke Turn Speed",
          durationMinutes: 60,
          distanceMeters: 2100,
          intensity: "moderate",
          skills: ["backstroke"],
          notes: "Dolphin kick counts off each turn.",
        },
      },
      { daysAgo: 4, status: "present" },
      { daysAgo: 2, status: "present" },
    ],
    times: [
      { daysAgo: 24, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 26800, context: "time_trial" },
      { daysAgo: 16, stroke: "backstroke", distanceMeters: 50, course: "short", timeMs: 31200, context: "practice" },
      { daysAgo: 9, stroke: "freestyle", distanceMeters: 100, course: "short", timeMs: 58900, context: "meet" },
      { daysAgo: 2, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 25600, context: "meet", notes: "1st place in Regional heat! New PB." },
    ],
    goals: [
      {
        title: "Break 25.0s in 50m Free",
        description: "Senior qualifying sprint standard.",
        type: "time",
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        targetTimeMs: 25000,
        baselineBestMs: 26800,
        progress: 67,
        status: "in_progress",
        targetDateDaysAhead: 50,
        updatedDaysAgo: 2,
      },
    ],
  },

  // 6. Aaliyah Patel (Competitive - IM & Butterfly)
  {
    name: "Aaliyah Patel",
    email: "aaliyah.patel@demo.swim",
    group: "Competitive",
    dateOfBirth: "2013-04-12",
    sex: "F",
    parentName: "Priya Patel",
    parentPhone: "+1 555-0355",
    parentEmail: "priya.patel@demo.swim",
    startingSkills: {
      freestyle: 70,
      backstroke: 65,
      breaststroke: 65,
      butterfly: 70,
      im: 70,
    },
    days: [
      { daysAgo: 23, status: "present" },
      { daysAgo: 20, status: "present" },
      { daysAgo: 18, status: "present" },
      {
        daysAgo: 15,
        status: "present",
        session: {
          title: "IM Strategy & Endurance",
          durationMinutes: 80,
          distanceMeters: 2700,
          intensity: "hard",
          skills: ["im", "butterfly", "backstroke"],
          notes: "Smooth transitions between strokes.",
        },
      },
      { daysAgo: 13, status: "present" },
      { daysAgo: 10, status: "present" },
      { daysAgo: 7, status: "late" },
      {
        daysAgo: 5,
        status: "present",
        session: {
          title: "Sprint Butterfly Set",
          durationMinutes: 60,
          distanceMeters: 2000,
          intensity: "hard",
          skills: ["butterfly"],
          notes: "8x25m fly at max tempo.",
        },
      },
      { daysAgo: 3, status: "present" },
      { daysAgo: 1, status: "present" },
    ],
    times: [
      { daysAgo: 23, stroke: "butterfly", distanceMeters: 50, course: "short", timeMs: 33400, context: "practice" },
      { daysAgo: 15, stroke: "im", distanceMeters: 100, course: "short", timeMs: 75200, context: "time_trial" },
      { daysAgo: 5, stroke: "butterfly", distanceMeters: 50, course: "short", timeMs: 31900, context: "meet", notes: "Clean rhythm, PB." },
      { daysAgo: 1, stroke: "im", distanceMeters: 200, course: "short", timeMs: 152000, context: "meet", notes: "Big improvement on breast leg." },
    ],
    goals: [
      {
        title: "Sub-1:13 100m IM",
        description: "Target for regional junior qualifying.",
        type: "time",
        stroke: "im",
        distanceMeters: 100,
        course: "short",
        targetTimeMs: 73000,
        baselineBestMs: 75200,
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -2,
        updatedDaysAgo: 2,
      },
    ],
  },

  // 7. Daniel Cruz (Development - Breaststroke & Habit Building)
  {
    name: "Daniel Cruz",
    email: "daniel.cruz@demo.swim",
    group: "Development",
    dateOfBirth: "2013-03-27",
    sex: "M",
    parentName: "Sofia Cruz",
    parentPhone: "+1 555-0193",
    parentEmail: "sofia.cruz@demo.swim",
    medicalNotes: "Nut allergy (EpiPen in coach kit). Ear tubes — avoid deep diving drills.",
    startingSkills: {
      freestyle: 50,
      backstroke: 40,
      breaststroke: 60,
      butterfly: 20,
      im: 30,
    },
    days: [
      { daysAgo: 22, status: "present" },
      { daysAgo: 20, status: "absent" },
      { daysAgo: 18, status: "present" },
      { daysAgo: 16, status: "late" },
      { daysAgo: 14, status: "present" },
      {
        daysAgo: 11,
        status: "present",
        session: {
          title: "Breaststroke Whip Kick Mechanics",
          durationMinutes: 45,
          distanceMeters: 900,
          intensity: "easy",
          skills: ["breaststroke"],
          notes: "Focus on heels to hips and symmetrical kick.",
        },
      },
      { daysAgo: 9, status: "present" },
      { daysAgo: 7, status: "present" },
      {
        daysAgo: 4,
        status: "present",
        session: {
          title: "Water Comfort & Kicks",
          durationMinutes: 45,
          distanceMeters: 800,
          intensity: "easy",
          skills: ["freestyle", "breaststroke"],
          notes: "Kickboard sets with breathing rhythm.",
        },
      },
      { daysAgo: 2, status: "present" },
    ],
    times: [
      { daysAgo: 22, stroke: "breaststroke", distanceMeters: 50, course: "short", timeMs: 46200, context: "practice" },
      { daysAgo: 14, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 38500, context: "practice" },
      { daysAgo: 4, stroke: "breaststroke", distanceMeters: 50, course: "short", timeMs: 42800, context: "time_trial", notes: "3.4s drop! Great kick timing." },
    ],
    goals: [
      {
        title: "90% Practice Consistency",
        description: "Maintain regular attendance to build stamina.",
        type: "attendance",
        targetAttendancePct: 90,
        progress: 80,
        status: "in_progress",
        targetDateDaysAhead: 45,
        updatedDaysAgo: 2,
      },
    ],
  },

  // 8. Lily Wu (Development - Backstroke & IM Foundations)
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
      backstroke: 55,
      breaststroke: 40,
      butterfly: 30,
      im: 40,
    },
    days: [
      { daysAgo: 22, status: "present" },
      { daysAgo: 19, status: "present" },
      {
        daysAgo: 16,
        status: "present",
        session: {
          title: "Streamlines & Body Line",
          durationMinutes: 50,
          distanceMeters: 1100,
          intensity: "moderate",
          skills: ["freestyle", "backstroke"],
          notes: "Holding streamline past the 5-meter flags.",
        },
      },
      { daysAgo: 14, status: "present" },
      { daysAgo: 11, status: "late" },
      {
        daysAgo: 8,
        status: "present",
        session: {
          title: "Backstroke Rotation Drills",
          durationMinutes: 45,
          distanceMeters: 1000,
          intensity: "moderate",
          skills: ["backstroke"],
          notes: "One-arm backstroke drill with steady flutter kick.",
        },
      },
      { daysAgo: 6, status: "present" },
      { daysAgo: 3, status: "present" },
      {
        daysAgo: 1,
        status: "present",
        session: {
          title: "Intro to IM Order",
          durationMinutes: 60,
          distanceMeters: 1400,
          intensity: "moderate",
          skills: ["butterfly", "backstroke", "breaststroke", "freestyle", "im"],
          notes: "Practicing legal transitions.",
        },
      },
    ],
    times: [
      { daysAgo: 22, stroke: "backstroke", distanceMeters: 50, course: "short", timeMs: 42500, context: "practice" },
      { daysAgo: 14, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 36200, context: "practice" },
      { daysAgo: 8, stroke: "backstroke", distanceMeters: 50, course: "short", timeMs: 39800, context: "time_trial", notes: "Broader arm recovery." },
      { daysAgo: 1, stroke: "im", distanceMeters: 100, course: "short", timeMs: 84000, context: "meet", notes: "First completed 100 IM!" },
    ],
    goals: [
      {
        title: "Legal 100m IM",
        description: "Swim legal 100m IM at the upcoming developmental mini-meet.",
        type: "manual",
        target: "Four clean strokes with legal touches and turns",
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -1,
        updatedDaysAgo: 1,
      },
    ],
  },

  // 9. Lucas Kim (Development - Free & Breath Control)
  {
    name: "Lucas Kim",
    email: "lucas.kim@demo.swim",
    group: "Development",
    dateOfBirth: "2014-06-11",
    sex: "M",
    parentName: "Jennifer Kim",
    parentPhone: "+1 555-0422",
    parentEmail: "jennifer.kim@demo.swim",
    medicalNotes: "Mild eczema — rinse thoroughly with clean water post-practice.",
    startingSkills: {
      freestyle: 45,
      backstroke: 40,
      breaststroke: 35,
      butterfly: 15,
      im: 25,
    },
    days: [
      { daysAgo: 21, status: "present" },
      { daysAgo: 19, status: "present" },
      { daysAgo: 16, status: "late" },
      {
        daysAgo: 14,
        status: "present",
        session: {
          title: "Bilateral Breathing Drills",
          durationMinutes: 45,
          distanceMeters: 850,
          intensity: "easy",
          skills: ["freestyle"],
          notes: "Breathing every 3 strokes without lifting head.",
        },
      },
      { daysAgo: 11, status: "present" },
      { daysAgo: 9, status: "present" },
      { daysAgo: 6, status: "present" },
      {
        daysAgo: 3,
        status: "present",
        session: {
          title: "Catch-Up Freestyle Technique",
          durationMinutes: 45,
          distanceMeters: 950,
          intensity: "easy",
          skills: ["freestyle", "backstroke"],
          notes: "Long glide before starting next pull.",
        },
      },
      { daysAgo: 1, status: "present" },
    ],
    times: [
      { daysAgo: 21, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 41200, context: "practice" },
      { daysAgo: 11, stroke: "backstroke", distanceMeters: 50, course: "short", timeMs: 46800, context: "practice" },
      { daysAgo: 3, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 37400, context: "time_trial", notes: "Smooth and calm breathing rhythm!" },
    ],
    goals: [
      {
        title: "Sub-36.0s 50m Free",
        description: "Sprint goal for development championship.",
        type: "time",
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        targetTimeMs: 36000,
        baselineBestMs: 41200,
        progress: 73,
        status: "in_progress",
        targetDateDaysAhead: 30,
        updatedDaysAgo: 3,
      },
    ],
  },

  // 10. Emma Garcia (Development - Butterfly Kick & Undulation)
  {
    name: "Emma Garcia",
    email: "emma.garcia@demo.swim",
    group: "Development",
    dateOfBirth: "2015-01-30",
    sex: "F",
    parentName: "Marco Garcia",
    parentPhone: "+1 555-0478",
    parentEmail: "marco.garcia@demo.swim",
    startingSkills: {
      freestyle: 50,
      backstroke: 45,
      breaststroke: 35,
      butterfly: 35,
      im: 30,
    },
    days: [
      { daysAgo: 21, status: "present" },
      { daysAgo: 18, status: "present" },
      {
        daysAgo: 15,
        status: "present",
        session: {
          title: "Dolphin Kick Rhythm",
          durationMinutes: 45,
          distanceMeters: 800,
          intensity: "easy",
          skills: ["butterfly"],
          notes: "Chest-led undulation with fins.",
        },
      },
      { daysAgo: 12, status: "late" },
      { daysAgo: 9, status: "present" },
      { daysAgo: 6, status: "present" },
      {
        daysAgo: 4,
        status: "present",
        session: {
          title: "Fly Arms Recovery & Entry",
          durationMinutes: 45,
          distanceMeters: 850,
          intensity: "moderate",
          skills: ["butterfly", "freestyle"],
          notes: "Fingertips skimming the surface on recovery.",
        },
      },
      { daysAgo: 2, status: "present" },
    ],
    times: [
      { daysAgo: 21, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 39500, context: "practice" },
      { daysAgo: 15, stroke: "butterfly", distanceMeters: 25, course: "short", timeMs: 19800, context: "practice" },
      { daysAgo: 4, stroke: "butterfly", distanceMeters: 50, course: "short", timeMs: 44200, context: "time_trial", notes: "First timed 50m butterfly!" },
    ],
    goals: [
      {
        title: "Continuous 50m Butterfly",
        description: "Complete full 50m Fly without stopping or touching bottom.",
        type: "manual",
        target: "50m Fly with two kicks per stroke",
        progress: 75,
        status: "in_progress",
        targetDateDaysAhead: 25,
        updatedDaysAgo: 4,
      },
    ],
  },

  // 11. Noah Jenkins (Development - Endurance Foundation)
  {
    name: "Noah Jenkins",
    email: "noah.jenkins@demo.swim",
    group: "Development",
    dateOfBirth: "2014-10-08",
    sex: "M",
    parentName: "Rachel Jenkins",
    parentPhone: "+1 555-0512",
    parentEmail: "rachel.jenkins@demo.swim",
    medicalNotes: "Uses Ventolin inhaler 15 min prior to strenuous swim sets.",
    startingSkills: {
      freestyle: 50,
      backstroke: 40,
      breaststroke: 45,
      butterfly: 20,
      im: 30,
    },
    days: [
      { daysAgo: 22, status: "present" },
      { daysAgo: 19, status: "present" },
      {
        daysAgo: 16,
        status: "present",
        session: {
          title: "Endurance Building & Pacing",
          durationMinutes: 45,
          distanceMeters: 1000,
          intensity: "moderate",
          skills: ["freestyle", "breaststroke"],
          notes: "3x100m freestyle at consistent speed.",
        },
      },
      { daysAgo: 13, status: "late" },
      { daysAgo: 10, status: "present" },
      { daysAgo: 7, status: "present" },
      {
        daysAgo: 4,
        status: "present",
        session: {
          title: "Flip Turns & Push-Off Depth",
          durationMinutes: 45,
          distanceMeters: 900,
          intensity: "easy",
          skills: ["freestyle"],
          notes: "Tuck chin and somersault straight over.",
        },
      },
      { daysAgo: 1, status: "present" },
    ],
    times: [
      { daysAgo: 22, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 38200, context: "practice" },
      { daysAgo: 16, stroke: "freestyle", distanceMeters: 100, course: "short", timeMs: 84500, context: "practice" },
      { daysAgo: 4, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 34900, context: "time_trial", notes: "Huge 3.3s drop! Great turns." },
    ],
    goals: [
      {
        title: "Sub-1:18 100m Free",
        description: "Move up to competitive squad trial standard.",
        type: "time",
        stroke: "freestyle",
        distanceMeters: 100,
        course: "short",
        targetTimeMs: 78000,
        baselineBestMs: 84500,
        progress: 55,
        status: "in_progress",
        targetDateDaysAhead: 40,
        updatedDaysAgo: 4,
      },
    ],
  },

  // 12. Maya Tanaka (Development - Junior Rookie)
  {
    name: "Maya Tanaka",
    email: "maya.tanaka@demo.swim",
    group: "Development",
    dateOfBirth: "2016-04-03",
    sex: "F",
    parentName: "Kenji Tanaka",
    parentPhone: "+1 555-0567",
    parentEmail: "kenji.tanaka@demo.swim",
    medicalNotes: "No medical restrictions.",
    startingSkills: {
      freestyle: 40,
      backstroke: 40,
      breaststroke: 30,
      butterfly: 20,
      im: 20,
    },
    days: [
      { daysAgo: 20, status: "present" },
      { daysAgo: 17, status: "present" },
      {
        daysAgo: 14,
        status: "present",
        session: {
          title: "Streamlines & Fun Relays",
          durationMinutes: 40,
          distanceMeters: 700,
          intensity: "easy",
          skills: ["freestyle", "backstroke"],
          notes: "Rocket streamlines off wall, high elbow recovery.",
        },
      },
      { daysAgo: 11, status: "present" },
      { daysAgo: 8, status: "late" },
      {
        daysAgo: 5,
        status: "present",
        session: {
          title: "Starting Block Dives",
          durationMinutes: 45,
          distanceMeters: 750,
          intensity: "easy",
          skills: ["freestyle"],
          notes: "Grab start practice from low blocks.",
        },
      },
      { daysAgo: 2, status: "present" },
    ],
    times: [
      { daysAgo: 20, stroke: "freestyle", distanceMeters: 25, course: "short", timeMs: 21500, context: "practice" },
      { daysAgo: 14, stroke: "backstroke", distanceMeters: 25, course: "short", timeMs: 23800, context: "practice" },
      { daysAgo: 5, stroke: "freestyle", distanceMeters: 50, course: "short", timeMs: 44200, context: "time_trial", notes: "Completed first 50m without stopping!" },
    ],
    goals: [
      {
        title: "Dive Confidently Off Blocks",
        description: "Clean dive entry without goggles slipping off.",
        type: "manual",
        target: "5 consecutive clean block entries",
        progress: 100,
        status: "completed",
        targetDateDaysAhead: -5,
        updatedDaysAgo: 5,
      },
      {
        title: "Sub-42.0s in 50m Free",
        description: "Aiming for next milestone in sprint freestyle.",
        type: "time",
        stroke: "freestyle",
        distanceMeters: 50,
        course: "short",
        targetTimeMs: 42000,
        baselineBestMs: 44200,
        progress: 25,
        status: "in_progress",
        targetDateDaysAhead: 30,
        updatedDaysAgo: 2,
      },
    ],
  },
];

type DemoPractice = {
  groupName: string;
  daysOffset: number; // negative = past, 0 = today, positive = future
  title: string;
  startTime: string;
  plannedDurationMinutes: number;
  plannedDistanceMeters: number;
  strokes: string[];
  notes: string;
  status: "planned" | "completed" | "cancelled";
};

export const DEMO_PRACTICES: DemoPractice[] = [
  // Competitive
  {
    groupName: "Competitive",
    daysOffset: -16,
    title: "Aerobic Capacity & Base Pace",
    startTime: "17:30",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3400,
    strokes: ["freestyle"],
    notes: "Long aerobic pull and paddle sets.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: -12,
    title: "IM Prep & Stroke Transitions",
    startTime: "17:30",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3000,
    strokes: ["freestyle", "backstroke", "breaststroke", "butterfly", "im"],
    notes: "Transition work between strokes.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: -7,
    title: "Endurance Threshold Set",
    startTime: "18:00",
    plannedDurationMinutes: 75,
    plannedDistanceMeters: 2800,
    strokes: ["freestyle", "breaststroke"],
    notes: "4x200m negative split pacing.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: -4,
    title: "Sprint Dynamics & Start Explosiveness",
    startTime: "17:30",
    plannedDurationMinutes: 60,
    plannedDistanceMeters: 2200,
    strokes: ["freestyle", "butterfly"],
    notes: "Block starts, 15m breakouts, turn velocity.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: -1,
    title: "Race Pace Simulation",
    startTime: "17:30",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3200,
    strokes: ["freestyle", "backstroke", "im"],
    notes: "Targeting meet pace through second 50.",
    status: "completed",
  },
  {
    groupName: "Competitive",
    daysOffset: 0, // Today!
    title: "Technique & Speed Tuning",
    startTime: "17:30",
    plannedDurationMinutes: 75,
    plannedDistanceMeters: 2600,
    strokes: ["freestyle", "backstroke", "breaststroke", "butterfly"],
    notes: "Fine-tuning stroke efficiency and relay takeoffs.",
    status: "planned",
  },
  {
    groupName: "Competitive",
    daysOffset: 2, // 2 days ahead
    title: "Max Effort Time Trials",
    startTime: "17:30",
    plannedDurationMinutes: 90,
    plannedDistanceMeters: 3000,
    strokes: ["freestyle", "butterfly", "im"],
    notes: "Official timed trials for upcoming invitational.",
    status: "planned",
  },
  {
    groupName: "Competitive",
    daysOffset: 5,
    title: "Recovery & Aerobic Flush",
    startTime: "18:00",
    plannedDurationMinutes: 60,
    plannedDistanceMeters: 2000,
    strokes: ["freestyle", "backstroke"],
    notes: "Low intensity active recovery.",
    status: "planned",
  },

  // Development
  {
    groupName: "Development",
    daysOffset: -16,
    title: "Streamlines & Push-Off Power",
    startTime: "16:30",
    plannedDurationMinutes: 50,
    plannedDistanceMeters: 1000,
    strokes: ["freestyle", "backstroke"],
    notes: "Holding streamline past the flags.",
    status: "completed",
  },
  {
    groupName: "Development",
    daysOffset: -11,
    title: "Backstroke Rotation & Flag Awareness",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 950,
    strokes: ["backstroke"],
    notes: "One-arm drills and straight line swim.",
    status: "completed",
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
    daysOffset: -4,
    title: "Water Comfort & Kicks",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 800,
    strokes: ["freestyle", "breaststroke"],
    notes: "Kickboard drills and breathing rhythm.",
    status: "completed",
  },
  {
    groupName: "Development",
    daysOffset: -1,
    title: "Intro to IM Order",
    startTime: "16:30",
    plannedDurationMinutes: 60,
    plannedDistanceMeters: 1400,
    strokes: ["butterfly", "backstroke", "breaststroke", "freestyle", "im"],
    notes: "Short 25m segment transitions.",
    status: "completed",
  },
  {
    groupName: "Development",
    daysOffset: 0, // Today!
    title: "Relay Games & Breathing Rhythm",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 800,
    strokes: ["freestyle", "breaststroke"],
    notes: "Fun relays and bilateral breathing practice.",
    status: "planned",
  },
  {
    groupName: "Development",
    daysOffset: 3,
    title: "Butterfly Dolphin Kick Rhythm",
    startTime: "16:30",
    plannedDurationMinutes: 45,
    plannedDistanceMeters: 900,
    strokes: ["butterfly"],
    notes: "Body undulation with fins.",
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
 * Seeds bulk demo data. If refresh is true, cleans existing student data first.
 * Safe for production: coach account and env credentials are preserved.
 * Run with: npx convex run seed:seed '{"refresh": true}'
 */
export const seed = action({
  args: {
    refresh: v.optional(v.boolean()),
  },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, args): Promise<{ created: number }> => {
    if (args.refresh) {
      await ctx.runMutation(internal.seed.cleanAllData, {});
    } else {
      const emails = DEMO_STUDENTS.map((demo) => demo.email);
      const taken: boolean = await ctx.runQuery(internal.seed.demoUsersExist, {
        emails,
      });
      if (taken) {
        throw new ConvexError(
          "Demo students already exist — run seed:refreshAndSeed or pass { refresh: true } to replace them.",
        );
      }
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
            98,
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

    // Generate weekly reports so dashboard and report cards show history
    await ctx.runMutation(internal.reports.generateWeekly, {});

    return { created: DEMO_STUDENTS.length };
  },
});

/**
 * Convenient CLI action: completely refreshes the database and seeds bulk demo data.
 * Run with: npx convex run seed:refreshAndSeed
 */
export const refreshAndSeed = action({
  args: {},
  returns: v.object({
    cleaned: v.boolean(),
    createdStudents: v.number(),
    createdPractices: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    cleaned: boolean;
    createdStudents: number;
    createdPractices: number;
  }> => {
    const res: { created: number } = await ctx.runAction(api.seed.seed, {
      refresh: true,
    });
    return {
      cleaned: true,
      createdStudents: res.created,
      createdPractices: DEMO_PRACTICES.length,
    };
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
 * table counts + which demo accounts exist.
 * Run with: npx convex run seed:status
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
        practicesCompleted: practices.filter((p) => p.status === "completed").length,
        practicesPlanned: practices.filter((p) => p.status === "planned").length,
        practicesCancelled: practices.filter((p) => p.status === "cancelled").length,
      },
      demoAccounts: demoEmails.map((email) => ({
        email,
        exists: existingEmails.has(email),
      })),
    };
  },
});

/**
 * Removes all demo data and student accounts, keeping coach accounts intact.
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
    await ctx.runMutation(internal.seed.cleanAllData, {});
    const remaining: number = await ctx.runQuery(
      internal.seed.studentCount,
      {},
    );
    return { removedStudents: DEMO_STUDENTS.length, remainingStudents: remaining };
  },
});

/**
 * Internal: Completely cleans student tables, practices, groups, and reports,
 * while strictly preserving the Coach user account.
 */
export const cleanAllData = internalMutation({
  args: {},
  returns: v.object({
    deletedStudents: v.number(),
    deletedGroups: v.number(),
  }),
  handler: async (ctx) => {
    // 1. Delete records in dependent tables
    const tables = [
      "attendance",
      "trainingSessions",
      "timeResults",
      "strokeSkills",
      "trainingGoals",
      "parentEmails",
      "reports",
      "practices",
    ] as const;

    for (const table of tables) {
      let docs = await ctx.db.query(table).take(1000);
      while (docs.length > 0) {
        for (const doc of docs) {
          await ctx.db.delete(table, doc._id);
        }
        docs = await ctx.db.query(table).take(1000);
      }
    }

    // 2. Identify student user accounts to remove
    const students = await ctx.db.query("students").take(1000);
    const studentUserIds = new Set<Id<"users">>();
    for (const s of students) {
      studentUserIds.add(s.userId);
      await ctx.db.delete("students", s._id);
    }

    const allUsers = await ctx.db.query("users").take(1000);
    for (const u of allUsers) {
      if (u.role === "student") {
        studentUserIds.add(u._id);
      }
    }

    // Delete auth records and student user documents safely
    for (const userId of studentUserIds) {
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .take(100);
      for (const session of sessions) {
        let tokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .take(100);
        while (tokens.length > 0) {
          for (const token of tokens) {
            const existingToken = await ctx.db.get("authRefreshTokens", token._id);
            if (existingToken) await ctx.db.delete("authRefreshTokens", token._id);
          }
          tokens = await ctx.db
            .query("authRefreshTokens")
            .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
            .take(100);
        }
        const existingSession = await ctx.db.get("authSessions", session._id);
        if (existingSession) await ctx.db.delete("authSessions", session._id);
      }

      const accounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .take(100);
      for (const account of accounts) {
        const existingAccount = await ctx.db.get("authAccounts", account._id);
        if (existingAccount) await ctx.db.delete("authAccounts", account._id);
      }

      const existingUser = await ctx.db.get("users", userId);
      if (existingUser) await ctx.db.delete("users", userId);
    }

    // 3. Delete groups safely
    const groups = await ctx.db.query("groups").take(1000);
    for (const g of groups) {
      const existingGroup = await ctx.db.get("groups", g._id);
      if (existingGroup) await ctx.db.delete("groups", g._id);
    }

    return {
      deletedStudents: students.length,
      deletedGroups: groups.length,
    };
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
    const reports = await ctx.db.query("reports").take(500);
    for (const r of reports) {
      await ctx.db.delete("reports", r._id);
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
