// convex/flags.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  attendanceDropFlag,
  consecutiveMissesFlag,
  goalDeadlineFlag,
  inactiveFlag,
  plateauFlag,
} from "./lib/flags";

const TODAY = "2026-08-29";

function att(date: string, status: "present" | "late" | "absent") {
  return { date, status };
}

describe("flag evaluators at exact thresholds", () => {
  it("consecutive_misses: fires at 2 trailing absences, not 1, and not when latest is present", () => {
    const two = consecutiveMissesFlag([
      att("2026-08-28", "absent"),
      att("2026-08-27", "absent"),
      att("2026-08-26", "present"),
    ]);
    expect(two?.kind).toBe("consecutive_misses");
    expect(two?.severity).toBe("high");

    const one = consecutiveMissesFlag([
      att("2026-08-28", "absent"),
      att("2026-08-27", "present"),
    ]);
    expect(one).toBeNull();

    const latestPresent = consecutiveMissesFlag([
      att("2026-08-28", "present"),
      att("2026-08-27", "absent"),
      att("2026-08-26", "absent"),
    ]);
    expect(latestPresent).toBeNull();
  });

  it("attendance_drop: fires on a large drop, stays quiet at exactly 14 points or with <3 records", () => {
    const fires = attendanceDropFlag(
      [
        // This month: 3 records, 1 attended = 33%
        att("2026-08-20", "absent"),
        att("2026-08-13", "absent"),
        att("2026-08-06", "present"),
        // Last month: 3/3 = 100%
        att("2026-07-20", "present"),
        att("2026-07-13", "present"),
        att("2026-07-06", "present"),
      ],
      TODAY,
    );
    expect(fires?.kind).toBe("attendance_drop");
    expect(fires?.severity).toBe("medium");

    // Exactly 14 points: this month 86% (6/7), last month 100% (3/3) -> quiet.
    const exact14 = attendanceDropFlag(
      [
        att("2026-08-28", "present"),
        att("2026-08-27", "present"),
        att("2026-08-26", "present"),
        att("2026-08-25", "present"),
        att("2026-08-24", "present"),
        att("2026-08-23", "present"),
        att("2026-08-22", "absent"),
        att("2026-07-30", "present"),
        att("2026-07-23", "present"),
        att("2026-07-16", "present"),
      ],
      TODAY,
    );
    expect(exact14).toBeNull();

    // Only 2 records this month -> quiet even at 0%.
    const tooFew = attendanceDropFlag(
      [
        att("2026-08-20", "absent"),
        att("2026-08-13", "absent"),
        att("2026-07-20", "present"),
        att("2026-07-13", "present"),
      ],
      TODAY,
    );
    expect(tooFew).toBeNull();
  });

  it("plateau: fires when the PB of a >=3-result event is older than 8 weeks", () => {
    const staleEvent = {
      stroke: "freestyle",
      distanceMeters: 50,
      course: "short" as const,
      results: [
        { date: "2026-01-05", timeMs: 32000 },
        { date: "2026-04-01", timeMs: 30000 }, // PB, ~20 weeks before TODAY
        { date: "2026-05-20", timeMs: 31000 },
      ],
    };
    const freshEvent = {
      stroke: "backstroke",
      distanceMeters: 100,
      course: "short" as const,
      results: [
        { date: "2026-08-10", timeMs: 75000 },
        { date: "2026-08-20", timeMs: 74000 }, // fresh PB
      ],
    };

    const flag = plateauFlag([staleEvent, freshEvent], TODAY);
    expect(flag?.kind).toBe("plateau");
    expect(flag?.severity).toBe("low");
    expect(flag?.detail).toContain("50m freestyle");

    // 2-result events never plateau.
    expect(plateauFlag([freshEvent], TODAY)).toBeNull();

    // 7-week-old PB (day 49) stays quiet: PB exactly 8 weeks ago (Jul 4).
    const week7 = {
      stroke: "freestyle",
      distanceMeters: 100,
      course: "short" as const,
      results: [
        { date: "2026-05-01", timeMs: 70000 },
        { date: "2026-07-11", timeMs: 69000 }, // 49 days = 7 weeks before TODAY
        { date: "2026-08-01", timeMs: 69500 },
      ],
    };
    expect(plateauFlag([week7], TODAY)).toBeNull();
  });

  it("goal_deadline: fires within 14 days, not at 15 or in the past", () => {
    const goals = [
      { title: "Sub-30 50m", targetDate: "2026-09-05", status: "in_progress" },
      { title: "Old goal", targetDate: "2026-08-01", status: "in_progress" },
      { title: "Far goal", targetDate: "2026-10-30", status: "in_progress" },
      { title: "Done goal", targetDate: "2026-08-30", status: "completed" },
    ];
    const flag = goalDeadlineFlag(goals, TODAY);
    expect(flag?.kind).toBe("goal_deadline");
    expect(flag?.detail).toContain("Sub-30 50m");

    expect(
      goalDeadlineFlag(
        [{ title: "Far", targetDate: "2026-09-13", status: "in_progress" }],
        TODAY,
      ),
    ).toBeNull(); // day 15
  });

  it("inactive: fires at 21 days without a session, respects record age", () => {
    expect(inactiveFlag("2026-08-08", TODAY, 400)?.kind).toBe("inactive"); // 21 days idle
    expect(inactiveFlag("2026-08-09", TODAY, 400)).toBeNull(); // 20 days
    expect(inactiveFlag(null, TODAY, 400)?.kind).toBe("inactive"); // never trained
    expect(inactiveFlag(null, TODAY, 20)).toBeNull(); // student too new
  });
});
