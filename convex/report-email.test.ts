// convex/report-email.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { athleteCardToCsv, renderReportEmail } from "./lib/reportEmail";
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
    const out = renderReportEmail({
      weekStart: "2026-08-24",
      card: sampleCard(),
      viewUrl: "https://example.com/parent/report?token=abc-123",
      csvUrl: "https://example.com/api/parent-report/csv?token=abc-123",
    });

    expect(out.subject).toBe("Weekly Swim Report — Maria <Reyes> (week of 2026-08-24)");
    expect(out.html).toContain("Maria &lt;Reyes&gt;");
    expect(out.html).toContain("90%");
    expect(out.html).toContain("4,200 m");
    expect(out.html).toContain("50m freestyle (SC)");
    expect(out.html).toContain("29.51");
    expect(out.html).toContain("Sub-29 50 free");
    expect(out.html).toContain("https://example.com/parent/report?token=abc-123");
    expect(out.html).toContain("https://example.com/api/parent-report/csv?token=abc-123");

    expect(out.text).toContain("Weekly Swim Report — Maria <Reyes> — Senior A, age 14 (week of 2026-08-24)");
    expect(out.text).toContain("Attended 9 of 10 sessions (90%)");
    expect(out.text).toContain("2026-08-17: 4,200 m");
    expect(out.text).toContain("2026-08-24: (no distance recorded)");
    expect(out.text).toContain("Freestyle: 72%");
    expect(out.text).toContain("50m freestyle (SC): 29.51 (set 2026-08-10)");
    expect(out.text).toContain("Sub-29 50 free — in_progress, 60%");
    expect(out.text).toContain("https://example.com/parent/report?token=abc-123");
    expect(out.text).toContain("https://example.com/api/parent-report/csv?token=abc-123");
  });
});

describe("athleteCardToCsv", () => {
  it("converts card payload to structured CSV rows", () => {
    const csv = athleteCardToCsv({ weekStart: "2026-08-24", card: sampleCard() });

    expect(csv).toContain('"Weekly Swim Report"');
    expect(csv).toContain('"Student","Maria <Reyes>"');
    expect(csv).toContain('"Group","Senior A"');
    expect(csv).toContain('"ATTENDANCE & COMMITMENT"');
    expect(csv).toContain('"Attendance Rate","90%"');
    expect(csv).toContain('"Commitment Rate","88%"');
    expect(csv).toContain('"TRAINING VOLUME HISTORY"');
    expect(csv).toContain('"2026-08-17","4200"');
    expect(csv).toContain('"STROKE SKILLS PROGRESS"');
    expect(csv).toContain('"Freestyle","72%"');
    expect(csv).toContain('"PERSONAL BESTS"');
    expect(csv).toContain('"50m freestyle (SC)","29.51","2026-08-10","3"');
    expect(csv).toContain('"TRAINING GOALS"');
    expect(csv).toContain('"Sub-29 50 free","in_progress","60%","2026-12-01"');
  });
});
