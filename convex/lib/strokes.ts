import { ConvexError } from "convex/values";

/**
 * Record-based stroke tracking: adding a new stroke later only
 * requires extending this list.
 */
export const STROKES = [
  { key: "freestyle", label: "Freestyle" },
  { key: "backstroke", label: "Backstroke" },
  { key: "breaststroke", label: "Breaststroke" },
  { key: "butterfly", label: "Butterfly" },
] as const;

export type StrokeKey = (typeof STROKES)[number]["key"];

export function isStrokeKey(value: string): value is StrokeKey {
  return STROKES.some((s) => s.key === value);
}

export function strokeLabel(key: string): string {
  return STROKES.find((s) => s.key === key)?.label ?? key;
}

export function assertStroke(value: string): void {
  if (!isStrokeKey(value)) {
    throw new ConvexError(`Unsupported stroke: ${value}`);
  }
}
