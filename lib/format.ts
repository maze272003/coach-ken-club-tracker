/**
 * Formats a "YYYY-MM-DD" date for display without timezone surprises.
 */
export function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Whole-year age from a "YYYY-MM-DD" date of birth (no timezone math).
 */
export function ageYears(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Maps backend errors to user-friendly messages.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

/**
 * Formats integer milliseconds into swim time string: "28.45" or "1:04.25".
 */
export function formatTimeMs(ms: number): string {
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

/**
 * Parses user-entered swim time ("28.45", "1:04.25", "01:04.25") into integer milliseconds.
 * Returns null if input is malformed or out of bounds (1ms - 3,600,000ms).
 */
export function parseTimeToMs(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pattern 1: mm:ss.cs or m:ss.cs or m:ss (e.g. 1:04.25, 1:04)
  const minSecMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (minSecMatch) {
    const mins = parseInt(minSecMatch[1], 10);
    const secs = parseInt(minSecMatch[2], 10);
    const csRaw = minSecMatch[3] ?? "0";
    const cs = parseInt(csRaw.padEnd(2, "0").slice(0, 2), 10);

    if (secs >= 60 || mins > 60) return null;
    const totalMs = mins * 60000 + secs * 1000 + cs * 10;
    if (totalMs <= 0 || totalMs > 3600000) return null;
    return totalMs;
  }

  // Pattern 2: ss.cs or s.cs or ss (e.g. 28.45, 59.9, 28)
  const secMatch = trimmed.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (secMatch) {
    const secs = parseInt(secMatch[1], 10);
    const csRaw = secMatch[2] ?? "0";
    const cs = parseInt(csRaw.padEnd(2, "0").slice(0, 2), 10);

    const totalMs = secs * 1000 + cs * 10;
    if (totalMs <= 0 || totalMs > 3600000) return null;
    return totalMs;
  }

  return null;
}

