// convex/reports.ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireCoach } from "./lib/access";
import { collectStudentFlags } from "./insights";
import { athleteCardVal, buildAthleteCard } from "./lib/reportCard";
import { datePlusDays, todayInCoachTz, weekStartIso } from "./lib/time";

const NOT_AUTHORIZED = "Not authorized";

/**
 * Coach-only: print-ready athlete report card, computed on demand
 * (never stored).
 */
export const athleteCard = query({
  args: { studentId: v.id("students") },
  returns: athleteCardVal,
  handler: async (ctx, { studentId }) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);

    const student = await ctx.db.get("students", studentId);
    if (!student) throw new ConvexError("Student not found");

    return buildAthleteCard(ctx, student, todayInCoachTz());
  },
});


type GroupReport = {
  groupName: string;
  practicesHeld: number;
  attendancePct: number | null;
  volumeMeters: number;
  pbs: number;
  flagsRaised: number;
};

/**
 * Weekly team report for the ISO week that just ended. Idempotent:
 * keyed by weekStart — re-running replaces the same week's doc.
 * Per-group failures are isolated into payload.errors.
 */
export const generateWeekly = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const today = todayInCoachTz();
    const weekStart = weekStartIso(datePlusDays(today, -1));
    const weekEnd = datePlusDays(weekStart, 6);

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(500);
    const students = await ctx.db.query("students").take(500);

    const groupReports: GroupReport[] = [];
    const errors: { groupName: string; error: string }[] = [];

    for (const group of groups) {
      try {
        const members = students.filter(
          (s) => s.groupId === group._id && s.status === "active",
        );
        const memberIds = new Set(members.map((m) => m._id));

        const [practices, attendance, sessions] = await Promise.all([
          ctx.db
            .query("practices")
            .withIndex("by_group_and_date", (q) =>
              q.eq("groupId", group._id).gte("date", weekStart).lte("date", weekEnd),
            )
            .take(100),
          ctx.db
            .query("attendance")
            .withIndex("by_date", (q) => q.gte("date", weekStart).lte("date", weekEnd))
            .take(10000),
          ctx.db
            .query("trainingSessions")
            .withIndex("by_date", (q) => q.gte("date", weekStart).lte("date", weekEnd))
            .take(10000),
        ]);

        const practicesHeld = practices.filter((p) => p.status === "completed").length;

        const memberAttendance = attendance.filter((a) => memberIds.has(a.studentId));
        const attended = memberAttendance.filter((a) => a.status !== "absent").length;
        const attendancePct =
          memberAttendance.length === 0
            ? null
            : Math.round((attended / memberAttendance.length) * 100);

        const volumeMeters = sessions
          .filter((s) => memberIds.has(s.studentId))
          .reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);

        let pbs = 0;
        for (const member of members) {
          const weekResults = await ctx.db
            .query("timeResults")
            .withIndex("by_student_and_date", (q) =>
              q.eq("studentId", member._id).gte("date", weekStart).lte("date", weekEnd),
            )
            .take(100);
          for (const result of weekResults) {
            const priors = await ctx.db
              .query("timeResults")
              .withIndex("by_student_and_event", (q) =>
                q
                  .eq("studentId", member._id)
                  .eq("stroke", result.stroke)
                  .eq("distanceMeters", result.distanceMeters)
                  .eq("course", result.course),
              )
              .take(500);
            // New PB: strictly faster than every result dated before this one.
            const isPb = priors.every(
              (p) => !(p.date < result.date) || p.timeMs > result.timeMs,
            );
            if (isPb) pbs += 1;
          }
        }

        let flagsRaised = 0;
        for (const member of members) {
          flagsRaised += (await collectStudentFlags(ctx, member, today)).length;
        }

        groupReports.push({
          groupName: group.name,
          practicesHeld,
          attendancePct,
          volumeMeters,
          pbs,
          flagsRaised,
        });
      } catch (err) {
        errors.push({
          groupName: group.name,
          error: err instanceof Error ? err.message : "unknown error",
        });
      }
    }

    const withPct = groupReports.filter((g) => g.attendancePct !== null);
    const payload = {
      weekStart,
      team: {
        practicesHeld: groupReports.reduce((acc, g) => acc + g.practicesHeld, 0),
        attendancePct:
          withPct.length === 0
            ? null
            : Math.round(
                withPct.reduce((acc, g) => acc + g.attendancePct!, 0) / withPct.length,
              ),
        volumeMeters: groupReports.reduce((acc, g) => acc + g.volumeMeters, 0),
        pbs: groupReports.reduce((acc, g) => acc + g.pbs, 0),
        flagsRaised: groupReports.reduce((acc, g) => acc + g.flagsRaised, 0),
      },
      groups: groupReports,
      errors,
    };

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_week_start", (q) => q.eq("weekStart", weekStart))
      .unique();
    if (existing) await ctx.db.delete("reports", existing._id);
    await ctx.db.insert("reports", {
      weekStart,
      payloadJson: JSON.stringify(payload),
      createdAt: Date.now(),
    });

    return null;
  },
});

/** Coach-only: recent weekly reports, latest first. */
export const list = query({
  args: {},
  returns: v.object({
    reports: v.array(
      v.object({
        _id: v.id("reports"),
        _creationTime: v.number(),
        weekStart: v.string(),
        payloadJson: v.string(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const coach = await requireCoach(ctx);
    if (!coach) throw new ConvexError(NOT_AUTHORIZED);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_week_start")
      .order("desc")
      .take(12);
    return { reports };
  },
});
