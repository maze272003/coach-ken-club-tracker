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
