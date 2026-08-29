// convex/report-email.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { renderReportEmail } from "./lib/reportEmail";
import type { AthleteCard } from "./lib/reportCard";

function sampleCard(): AthleteCard {
  return {
    student: {
      name: "Maria <Reyes>",
      email: "maria@example.com",
      age: 14,
      joinedAt: "2026-01-15",
    },
    groupName: "Senior A",
    attendance: { total: 10, attended: 9, percentage: 90 },
    commitment: { held: 8, attended: 7, percentage: 88 },
    volumeByWeek: [
      { label: "2026-08-17", value: 4200 },
      { label: "2026-08-24", value: null },
    ],
    skills: [{ name: "Freestyle", progress: 72 }],
    pbs: [
      {
        label: "50m freestyle (SC)",
        bestTimeMs: 29_512,
        bestDate: "2026-08-10",
        resultCount: 3,
      },
    ],
    goals: [
      { title: "Sub-29 50 free", status: "in_progress", progress: 60, targetDate: "2026-12-01" },
    ],
  };
}

describe("renderReportEmail", () => {
  it("builds subject, html, and text with the card's key numbers", () => {
    const out = renderReportEmail({ weekStart: "2026-08-24", card: sampleCard() });

    expect(out.subject).toBe("Weekly Swim Report — Maria <Reyes> (week of 2026-08-24)");
    expect(out.html).toContain("Maria &lt;Reyes&gt;");
    expect(out.html).toContain("90%");
    expect(out.html).toContain("4,200 m");
    expect(out.html).toContain("50m freestyle (SC)");
    expect(out.html).toContain("29.51");
    expect(out.html).toContain("Sub-29 50 free");

    expect(out.text).toContain("Weekly Swim Report — Maria <Reyes> — Senior A, age 14 (week of 2026-08-24)");
    expect(out.text).toContain("Attended 9 of 10 sessions (90%)");
    expect(out.text).toContain("2026-08-17: 4,200 m");
    expect(out.text).toContain("2026-08-24: (no distance recorded)");
    expect(out.text).toContain("Freestyle: 72%");
    expect(out.text).toContain("50m freestyle (SC): 29.51 (set 2026-08-10)");
    expect(out.text).toContain("Sub-29 50 free — in_progress, 60%");
  });
});
