// convex/parent-emails-schema.test.ts
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { seedStudent } from "./tests/helpers";

describe("parentEmails table", () => {
  it("allows querying a single row by weekStart and studentId using unique()", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "Alex Santos");

    await t.run(async (ctx) => {
      await ctx.db.insert("parentEmails", {
        studentId,
        weekStart: "2026-08-24",
        toEmail: "parent@example.com",
        payloadJson: "{}",
        status: "pending",
        attempts: 0,
        dueAt: Date.now(),
        createdAt: Date.now(),
      });
    });

    const doc = await t.run(async (ctx) => {
      return await ctx.db
        .query("parentEmails")
        .withIndex("by_week_and_student", (q) =>
          q.eq("weekStart", "2026-08-24").eq("studentId", studentId),
        )
        .unique();
    });

    expect(doc).not.toBeNull();
    expect(doc?.toEmail).toBe("parent@example.com");

    // Adding a second row causes .unique() to throw
    await t.run(async (ctx) => {
      await ctx.db.insert("parentEmails", {
        studentId,
        weekStart: "2026-08-24",
        toEmail: "parent2@example.com",
        payloadJson: "{}",
        status: "pending",
        attempts: 0,
        dueAt: Date.now(),
        createdAt: Date.now(),
      });
    });

    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("parentEmails")
          .withIndex("by_week_and_student", (q) =>
            q.eq("weekStart", "2026-08-24").eq("studentId", studentId),
          )
          .unique();
      }),
    ).rejects.toThrow();
  });

  it("indexes pending rows by dueAt", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seedStudent(t, "Alex Santos");
    await t.run(async (ctx) => {
      await ctx.db.insert("parentEmails", {
        studentId,
        weekStart: "2026-08-24",
        toEmail: "parent@example.com",
        payloadJson: "{}",
        status: "pending",
        attempts: 0,
        dueAt: 1_000,
        createdAt: Date.now(),
      });
    });

    const due = await t.run(async (ctx) => {
      return await ctx.db
        .query("parentEmails")
        .withIndex("by_status_and_due", (q) =>
          q.eq("status", "pending").lte("dueAt", Date.now()),
        )
        .collect();
    });
    expect(due).toHaveLength(1);
    expect(due[0]!.toEmail).toBe("parent@example.com");
  });
});
