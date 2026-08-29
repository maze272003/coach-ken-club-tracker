// convex/lib/reportEmail.ts
import type { AthleteCard } from "./reportCard";

export type ReportEmailPayload = { weekStart: string; card: AthleteCard };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(ms: number): string {
  if (ms <= 0) return "--:--.--";
  const totalHundredths = Math.round(ms / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(totalHundredths / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  const csStr = String(hundredths).padStart(2, "0");
  if (minutes === 0) {
    return `${seconds}.${csStr}`;
  }
  const sStr = String(seconds).padStart(2, "0");
  return `${minutes}:${sStr}.${csStr}`;
}

function formatMeters(value: number | null): string {
  return value === null ? "(no distance recorded)" : `${value.toLocaleString("en-US")} m`;
}

const SECTION_STYLE = "font-size:16px;font-weight:bold;margin:20px 0 6px 0;";

export function renderReportEmail(payload: ReportEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const { weekStart, card } = payload;
  const subject = `Weekly Swim Report — ${card.student.name} (week of ${weekStart})`;

  const currentWeekLabel =
    card.volumeByWeek[card.volumeByWeek.length - 1]?.label ?? null;

  const volumeHtml = card.volumeByWeek
    .map((w) => {
      const bold = w.label === currentWeekLabel ? "font-weight:bold;" : "";
      return `<tr><td style="padding:2px 8px;${bold}">${esc(w.label)}</td><td style="padding:2px 8px;text-align:right;${bold}">${esc(formatMeters(w.value))}</td></tr>`;
    })
    .join("");
  const volumeText = card.volumeByWeek
    .map((w) => `${w.label}: ${formatMeters(w.value)}`)
    .join("\n");

  const attendancePct =
    card.attendance.percentage === null ? "—" : `${card.attendance.percentage}%`;
  const commitmentText =
    card.commitment === null
      ? "No group assigned"
      : `${card.commitment.attended} of ${card.commitment.held} held practices (${card.commitment.percentage ?? "—"}%)`;
  const commitmentHtml =
    card.commitment === null
      ? "No group assigned"
      : esc(commitmentText);

  const skillsHtml = card.skills
    .map((s) => `<li style="padding:1px 0;">${esc(s.name)}: ${s.progress}%</li>`)
    .join("");
  const skillsText = card.skills
    .map((s) => `${s.name}: ${s.progress}%`)
    .join("\n");

  const pbsHtml = card.pbs
    .map(
      (p) =>
        `<li style="padding:1px 0;">${esc(p.label)}: ${formatTime(p.bestTimeMs)} (set ${esc(p.bestDate)}, ${p.resultCount} result${p.resultCount === 1 ? "" : "s"})</li>`,
    )
    .join("");
  const pbsText = card.pbs
    .map((p) => `${p.label}: ${formatTime(p.bestTimeMs)} (set ${p.bestDate})`)
    .join("\n");

  const goalsHtml = card.goals
    .map((g) => {
      const target = g.targetDate ? `, target ${esc(g.targetDate)}` : "";
      return `<li style="padding:1px 0;">${esc(g.title)} — ${esc(g.status)}, ${g.progress}%${target}</li>`;
    })
    .join("");
  const goalsText = card.goals
    .map((g) => {
      const target = g.targetDate ? `, target ${g.targetDate}` : "";
      return `${g.title} — ${g.status}, ${g.progress}%${target}`;
    })
    .join("\n");

  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;">
<h2 style="margin:0 0 4px 0;">Weekly Swim Report</h2>
<p style="margin:0 0 16px 0;color:#555;">${esc(card.student.name)}${card.groupName ? ` — ${esc(card.groupName)}` : ""}${card.student.age !== null ? `, age ${card.student.age}` : ""} · week of ${esc(weekStart)}</p>

<div style="${SECTION_STYLE}">Attendance</div>
<p style="margin:0;">Attended ${card.attendance.attended} of ${card.attendance.total} sessions (${attendancePct})</p>

<div style="${SECTION_STYLE}">Commitment</div>
<p style="margin:0;">${commitmentHtml}</p>

<div style="${SECTION_STYLE}">Training volume (last ${card.volumeByWeek.length} weeks)</div>
<table style="border-collapse:collapse;">${volumeHtml}</table>

<div style="${SECTION_STYLE}">Skills</div>
<ul style="margin:0;padding-left:20px;">${skillsHtml}</ul>

<div style="${SECTION_STYLE}">Personal bests</div>
<ul style="margin:0;padding-left:20px;">${pbsHtml}</ul>

<div style="${SECTION_STYLE}">Goals</div>
<ul style="margin:0;padding-left:20px;">${goalsHtml}</ul>

<p style="margin-top:24px;color:#888;font-size:12px;">Sent by CoachKen Tracker. Reply to this email to reach the coach.</p>
</body></html>`;

  const text = `Weekly Swim Report — ${card.student.name}${card.groupName ? ` — ${card.groupName}` : ""}${card.student.age !== null ? `, age ${card.student.age}` : ""} (week of ${weekStart})

ATTENDANCE
Attended ${card.attendance.attended} of ${card.attendance.total} sessions (${attendancePct})

COMMITMENT
${commitmentText}

TRAINING VOLUME (${card.volumeByWeek.length} weeks)
${volumeText}

SKILLS
${skillsText}

PERSONAL BESTS
${pbsText}

GOALS
${goalsText}

Sent by CoachKen Tracker. Reply to this email to reach the coach.`;

  return { subject, html, text };
}
