// convex/lib/time.ts
/**
 * All coach-local calendar logic. Convex functions run in UTC; the
 * coach operates in Asia/Manila (UTC+8, no DST). "Today", week
 * starts (Monday), and month keys always flow through this module.
 */
export const COACH_TZ = "Asia/Manila";

function ymdInTz(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COACH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayInCoachTz(now: Date = new Date()): string {
  return ymdInTz(now);
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function datePlusDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * 86_400_000));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function weekStartIso(date: string): string {
  const dow = toUtc(date).getUTCDay(); // 0 = Sunday
  return datePlusDays(date, -((dow + 6) % 7));
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** The last `count` month keys ending at `from`'s month, ascending. */
export function monthKeysBack(count: number, from: string): string[] {
  const d = toUtc(from);
  d.setUTCDate(1);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return keys.reverse();
}

/** The last `count` Monday week-starts ending at `from`'s week, ascending. */
export function weekStartsBack(count: number, from: string): string[] {
  const keys: string[] = [];
  let cursor = weekStartIso(from);
  for (let i = 0; i < count; i++) {
    keys.push(cursor);
    cursor = datePlusDays(cursor, -7);
  }
  return keys.reverse();
}
