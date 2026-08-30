// lib/password.test.ts
import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "./password";

describe("generateTemporaryPassword", () => {
  it("generates passwords of default length 12", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(12);
  });

  it("enforces minimum length of 8 when smaller length requested", () => {
    const pw = generateTemporaryPassword(4);
    expect(pw).toHaveLength(8);
  });

  it("generates requested length greater than 8", () => {
    const pw = generateTemporaryPassword(16);
    expect(pw).toHaveLength(16);
  });

  it("includes lowercase, uppercase, number, and symbol", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateTemporaryPassword(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%&*]/);
    }
  });

  it("produces distinct random passwords across invocations", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      set.add(generateTemporaryPassword());
    }
    expect(set.size).toBe(50);
  });
});
