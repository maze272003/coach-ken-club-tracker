// convex/parent-emails-authz.test.ts
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { sendMail } from "./lib/mailer";

vi.mock("./lib/mailer", () => ({
  sendMail: vi.fn(),
}));
const sendMailMock = vi.mocked(sendMail);
sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

async function seedWithParent(
  t: ReturnType<typeof convexTest>,
  name: string,
): Promise<void> {
  const { studentId } = await seedStudent(t, name);
  await t.run(async (ctx) => {
    await ctx.db.patch("students", studentId, {
      parentEmail: "parent@example.com",
    });
  });
}

describe("parentEmails.triggerNow", () => {
  it("rejects students and anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const { userId, studentId } = await seedStudent(t, "Alex Santos");
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.parentEmails.triggerNow, {}),
    ).rejects.toThrow("Not authorized");
    await expect(t.mutation(api.parentEmails.triggerNow, {})).rejects.toThrow(
      "Not authorized",
    );
    expect(studentId).toBeTruthy();
  });

  it("enqueues missing students for the coach, idempotently", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    await seedWithParent(t, "Alex Santos");

    const first = await t
      .withIdentity({ subject: coachId })
      .mutation(api.parentEmails.triggerNow, {});
    const second = await t
      .withIdentity({ subject: coachId })
      .mutation(api.parentEmails.triggerNow, {});

    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0);
    expect(first.weekStart).toBe(second.weekStart);
  });
});

describe("parentEmails.weekStatus", () => {
  it("counts this week's queue for the coach and rejects students", async () => {
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    await seedWithParent(t, "Alex Santos");

    await t
      .withIdentity({ subject: coachId })
      .mutation(api.parentEmails.triggerNow, {});

    const status = await t
      .withIdentity({ subject: coachId })
      .query(api.parentEmails.weekStatus, {});
    expect(status.pending).toBe(1);
    expect(status.sent).toBe(0);
    expect(status.failed).toBe(0);

    const { userId } = await seedStudent(t, "Someone Else");
    await expect(
      t.withIdentity({ subject: userId }).query(api.parentEmails.weekStatus, {}),
    ).rejects.toThrow("Not authorized");
  });
});
