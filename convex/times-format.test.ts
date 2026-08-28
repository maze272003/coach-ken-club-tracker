/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { formatTimeMs, parseTimeToMs } from "../lib/format";
import { assertCourse, assertEventDistance, assertStroke, assertTimeMs } from "./lib/validation";

describe("Time Parsing and Formatting Helpers", () => {
  it("parses seconds and hundredths correctly", () => {
    expect(parseTimeToMs("28.45")).toBe(28450);
    expect(parseTimeToMs("0.50")).toBe(500);
    expect(parseTimeToMs("59.99")).toBe(59990);
    expect(parseTimeToMs("28")).toBe(28000);
    expect(parseTimeToMs("28.4")).toBe(28400);
  });

  it("parses minutes, seconds, and hundredths correctly", () => {
    expect(parseTimeToMs("1:04.25")).toBe(64250);
    expect(parseTimeToMs("01:04.25")).toBe(64250);
    expect(parseTimeToMs("15:30.00")).toBe(930000);
    expect(parseTimeToMs("1:04")).toBe(64000);
  });

  it("rejects invalid time strings or out-of-bounds numbers", () => {
    expect(parseTimeToMs("")).toBeNull();
    expect(parseTimeToMs("abc")).toBeNull();
    expect(parseTimeToMs("0")).toBeNull();
    expect(parseTimeToMs("0.00")).toBeNull();
    expect(parseTimeToMs("-5.00")).toBeNull();
    expect(parseTimeToMs("65:00.00")).toBeNull(); // > 60 minutes
    expect(parseTimeToMs("1:65.00")).toBeNull(); // invalid seconds
  });

  it("formats milliseconds into standard swim display", () => {
    expect(formatTimeMs(28450)).toBe("28.45");
    expect(formatTimeMs(64250)).toBe("1:04.25");
    expect(formatTimeMs(930000)).toBe("15:30.00");
    expect(formatTimeMs(500)).toBe("0.50");
  });

  it("validates event distances, courses, strokes, and time bounds", () => {
    expect(() => assertEventDistance(50)).not.toThrow();
    expect(() => assertEventDistance(75)).toThrow();
    expect(() => assertCourse("short")).not.toThrow();
    expect(() => assertCourse("long")).not.toThrow();
    expect(() => assertCourse("yards" as unknown as "short")).toThrow();
    expect(() => assertStroke("freestyle")).not.toThrow();
    expect(() => assertStroke("im")).not.toThrow();
    expect(() => assertStroke("dog_paddle" as unknown as "freestyle")).toThrow();
    expect(() => assertTimeMs(25000)).not.toThrow();

    expect(() => assertTimeMs(0)).toThrow();
    expect(() => assertTimeMs(3600001)).toThrow();
  });
});
