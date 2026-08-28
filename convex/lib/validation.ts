import { ConvexError } from "convex/values";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates are stored as "YYYY-MM-DD" strings (sortable, timezone-safe).
 */
export function assertDateString(value: string): void {
  if (!DATE_REGEX.test(value)) {
    throw new ConvexError("Invalid date: expected YYYY-MM-DD");
  }
  const parsed = new Date(value + "T00:00:00Z");
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ConvexError("Invalid date: not a real calendar date");
  }
}

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Months are passed around as "YYYY-MM" strings.
 */
export function assertMonthString(value: string): void {
  if (!MONTH_REGEX.test(value)) {
    throw new ConvexError("Invalid month: expected YYYY-MM");
  }
}

export function assertProgress(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new ConvexError("Progress must be a whole number between 0 and 100");
  }
}

export function assertDuration(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 24 * 60) {
    throw new ConvexError("Duration must be a positive number of minutes");
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    throw new ConvexError("Invalid email address");
  }
  return email;
}

export function normalizeName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > 100) {
    throw new ConvexError("Name must be between 1 and 100 characters");
  }
  return name;
}

export function assertPassword(value: string): void {
  if (value.length < 8 || value.length > 128) {
    throw new ConvexError("Password must be between 8 and 128 characters");
  }
}

export function normalizeSkillName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > 60) {
    throw new ConvexError("Skill name must be between 1 and 60 characters");
  }
  return name;
}

/**
 * Stable identifier for a skill, derived from its name. Existing
 * records (student progress, training sessions) reference this key,
 * so it never changes once created — renaming only changes `name`.
 */
export function slugifySkillName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (slug.length === 0) {
    throw new ConvexError("Skill name must contain letters or numbers");
  }
  return slug;
}

export function normalizeGroupName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > 80) {
    throw new ConvexError("Group name must be between 1 and 80 characters");
  }
  return name;
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Times of day are stored as 24-hour "HH:MM" strings.
 */
export function assertTimeString(value: string): void {
  if (!TIME_REGEX.test(value)) {
    throw new ConvexError("Invalid time: expected HH:MM (24-hour)");
  }
}

export function assertDistanceMeters(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 30000) {
    throw new ConvexError("Distance must be between 1 and 30000 meters");
  }
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Date of birth must be a real calendar date between 3 and 100 years
 * in the past. Uses the wall clock — call from mutations only.
 */
export function assertDateOfBirth(value: string): void {
  assertDateString(value);
  const ms = Date.parse(`${value}T00:00:00Z`);
  const ageMs = Date.now() - ms;
  if (ageMs < 3 * YEAR_MS) {
    throw new ConvexError("Date of birth must be at least 3 years in the past");
  }
  if (ageMs > 100 * YEAR_MS) {
    throw new ConvexError("Date of birth must be within the last 100 years");
  }
}

export const VALID_DISTANCES = [25, 50, 100, 200, 400, 800, 1500] as const;
export type EventDistance = (typeof VALID_DISTANCES)[number];

export const VALID_STROKES = [
  "freestyle",
  "backstroke",
  "breaststroke",
  "butterfly",
  "im",
] as const;
export type ValidStroke = (typeof VALID_STROKES)[number];

export function assertTimeMs(ms: number): void {
  if (!Number.isInteger(ms) || ms <= 0 || ms > 3600000) {
    throw new ConvexError("Time must be between 0.01s and 60 minutes");
  }
}

export function assertEventDistance(distance: number): asserts distance is EventDistance {
  if (!VALID_DISTANCES.includes(distance as EventDistance)) {
    throw new ConvexError(
      `Invalid distance. Must be one of: ${VALID_DISTANCES.join(", ")}m`,
    );
  }
}

export function assertCourse(course: string): asserts course is "short" | "long" {
  if (course !== "short" && course !== "long") {
    throw new ConvexError("Course must be 'short' (25m) or 'long' (50m)");
  }
}

export function assertStroke(stroke: string): asserts stroke is ValidStroke {
  if (!VALID_STROKES.includes(stroke as ValidStroke)) {
    throw new ConvexError(`Invalid stroke: ${stroke}`);
  }
}


