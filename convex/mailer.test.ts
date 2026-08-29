// convex/mailer.test.ts
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

import { sendMail } from "./lib/mailer";

const ENV_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  sendMailMock.mockReset();
  vi.resetModules();
});

describe("sendMail", () => {
  it("returns a clear error when SMTP secrets are missing", async () => {
    const result = await sendMail({
      to: "parent@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("SMTP not configured");
  });

  it("sends via the transport and returns the messageId", async () => {
    process.env.SMTP_USER = "coach@gmail.com";
    process.env.SMTP_PASS = "app-password";
    process.env.MAIL_FROM = "CoachKen Tracker <coach@gmail.com>";
    sendMailMock.mockResolvedValue({ messageId: "<abc-1>" });

    const result = await sendMail({
      to: "parent@example.com",
      subject: "Weekly report",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toEqual({ ok: true, messageId: "<abc-1>" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(mail.to).toBe("parent@example.com");
    expect(mail.subject).toBe("Weekly report");
    expect(mail.from).toBe("CoachKen Tracker <coach@gmail.com>");
    expect(mail.replyTo).toBe("coach@gmail.com");
  });

  it("captures transport errors as failed results", async () => {
    process.env.SMTP_USER = "coach@gmail.com";
    process.env.SMTP_PASS = "app-password";
    sendMailMock.mockRejectedValue(new Error("connection refused"));

    const result = await sendMail({
      to: "parent@example.com",
      subject: "s",
      html: "h",
      text: "t",
    });
    expect(result).toEqual({ ok: false, error: "connection refused" });
  });
});
