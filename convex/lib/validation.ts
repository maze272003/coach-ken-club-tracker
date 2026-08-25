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
