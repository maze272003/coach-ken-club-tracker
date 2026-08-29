// convex/time.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  COACH_TZ,
  datePlusDays,
  daysBetween,
  monthKey,
  monthKeysBack,
  todayInCoachTz,
  weekStartIso,
  weekStartsBack,
} from "./lib/time";

describe("coach timezone helpers", () => {
  it("converts UTC instants to Asia/Manila calendar days", () => {
    expect(COACH_TZ).toBe("Asia/Manila");
    expect(todayInCoachTz(new Date("2026-08-29T15:59:00Z"))).toBe("2026-08-29");
    expect(todayInCoachTz(new Date("2026-08-29T16:00:00Z"))).toBe("2026-08-30");
  });

  it("does calendar math without timezone drift", () => {
    expect(datePlusDays("2026-08-29", 1)).toBe("2026-08-30");
    expect(datePlusDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(datePlusDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-08-01", "2026-08-29")).toBe(28);
    expect(daysBetween("2026-08-29", "2026-08-01")).toBe(-28);
  });

  it("finds the Monday of the week (2026-08-29 is a Saturday)", () => {
    expect(weekStartIso("2026-08-29")).toBe("2026-08-24");
    expect(weekStartIso("2026-08-24")).toBe("2026-08-24");
    expect(weekStartIso("2026-08-30")).toBe("2026-08-24");
  });

  it("keys months and walks month/week ladders", () => {
    expect(monthKey("2026-08-29")).toBe("2026-08");
    expect(monthKeysBack(3, "2026-08-15")).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(weekStartsBack(2, "2026-08-29")).toEqual(["2026-08-17", "2026-08-24"]);
  });
});
