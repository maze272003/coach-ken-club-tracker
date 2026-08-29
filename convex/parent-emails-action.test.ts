// convex/parent-emails-action.test.ts
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { seedCoach, seedStudent } from "./tests/helpers";
import { sendMail } from "./lib/mailer";
import { DRIP_INTERVAL_MS } from "./parentEmails";

vi.mock("./lib/mailer", () => ({
  sendMail: vi.fn(),
}));

const sendMailMock = vi.mocked(sendMail);

type EmailDoc = {
  _id: string;
  status: string;
  attempts: number;
  lastError?: string;
  sentAt?: number;
};

async function allRows(t: ReturnType<typeof convexTest>): Promise<EmailDoc[]> {
  return t.run(async (ctx) => {
    return (await ctx.db.query("parentEmails").collect()) as unknown as EmailDoc[];
  });
}

async function seedWithParent(
  t: ReturnType<typeof convexTest>,
  name: string,
): Promise<string> {
  const { studentId } = await seedStudent(t, name);
  await t.run(async (ctx) => {
    await ctx.db.patch("students", studentId, { parentEmail: `${name.split(" ")[0]}@parent.example.com` });
  });
  return studentId;
}

afterEach(() => {
  sendMailMock.mockReset();
  vi.useRealTimers();
});

describe("parentEmails.processBatch", () => {
  it("sends the rendered card to each claimed row and marks them sent", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedWithParent(t, "Alex Santos");
    await seedWithParent(t, "Maria Reyes");
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.action(internal.parentEmailsActions.processBatch, {});

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const first = sendMailMock.mock.calls[0][0];
    expect(first.to).toContain("@parent.example.com");
    expect(first.subject).toMatch(/^Weekly Swim Report — .+ \(week of \d{4}-\d{2}-\d{2}\)$/);
    expect(first.html).toContain("Attendance");
    expect(first.text).toContain("ATTENDANCE");

    const rows = await allRows(t);
    expect(rows.filter((r) => r.status === "sent")).toHaveLength(2);
  });

  it("keeps failed sends pending with the error recorded", async () => {
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedWithParent(t, "Alex Santos");
    sendMailMock.mockResolvedValue({ ok: false, error: "smtp down" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.action(internal.parentEmailsActions.processBatch, {});

    const rows = await allRows(t);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.lastError).toBe("smtp down");
  });

  it("drains a multi-batch queue through the self-rescheduling scheduler", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await seedCoach(t);
    for (let i = 0; i < 7; i++) {
      await seedWithParent(t, `Swimmer ${i}`);
    }
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(DRIP_INTERVAL_MS);
    });

    expect(sendMailMock).toHaveBeenCalledTimes(7);
    const rows = await allRows(t);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });
});

describe("parentEmails.kickIfPending", () => {
  it("drains pending rows when kicked (safety drain)", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await seedCoach(t);
    await seedWithParent(t, "Alex Santos");
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<1>" });

    await t.mutation(internal.parentEmails.enqueueWeekly, {});
    // enqueueWeekly already kicked processBatch; drain that first.
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(DRIP_INTERVAL_MS);
    });

    const rows = await allRows(t);
    expect(rows[0]!.status).toBe("sent");

    // Kick with an empty queue: no more sends.
    await t.mutation(internal.parentEmails.kickIfPending, {});
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(DRIP_INTERVAL_MS);
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});
