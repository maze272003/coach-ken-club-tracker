// convex/account-emails.test.ts
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import { seedCoach } from "./tests/helpers";
import { sendMail } from "./lib/mailer";
import { renderAccountCreationEmail } from "./lib/accountEmail";

vi.mock("./lib/mailer", () => ({
  sendMail: vi.fn(),
}));

const sendMailMock = vi.mocked(sendMail);

afterEach(() => {
  sendMailMock.mockReset();
  vi.useRealTimers();
});

describe("renderAccountCreationEmail", () => {
  it("renders welcome subject, student credentials, and login link in html and text", () => {
    const rendered = renderAccountCreationEmail({
      name: "Sam <Swimmer>",
      email: "sam@example.com",
      password: "secret_password_123",
      loginUrl: "https://coachken.example.com/login",
    });

    expect(rendered.subject).toBe(
      "Welcome to CoachKen Swim Club — Your Account Credentials",
    );

    // HTML assertions
    expect(rendered.html).toContain("Sam &lt;Swimmer&gt;");
    expect(rendered.html).toContain("sam@example.com");
    expect(rendered.html).toContain("secret_password_123");
    expect(rendered.html).toContain("https://coachken.example.com/login");
    expect(rendered.html).toContain("Sign In to Tracker");

    // Text assertions
    expect(rendered.text).toContain("Hi Sam <Swimmer>,");
    expect(rendered.text).toContain("Email (Login): sam@example.com");
    expect(rendered.text).toContain("Temporary Password: secret_password_123");
    expect(rendered.text).toContain("Log in at: https://coachken.example.com/login");
  });

  it("falls back to default /login path when loginUrl is not provided", () => {
    const rendered = renderAccountCreationEmail({
      name: "Alex Doe",
      email: "alex@example.com",
      password: "password123",
    });

    expect(rendered.html).toContain('href="/login"');
    expect(rendered.text).toContain("Log in at: /login");
  });
});

describe("accountEmailsActions.sendAccountCreationEmail", () => {
  it("sends account creation email via sendMail", async () => {
    const t = convexTest(schema, modules);
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<msg-1>" });

    await t.action(internal.accountEmailsActions.sendAccountCreationEmail, {
      toEmail: "student@example.com",
      name: "Student One",
      password: "TempPassword123!",
      loginUrl: "https://app.example.com/login",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const callArg = sendMailMock.mock.calls[0][0];
    expect(callArg.to).toBe("student@example.com");
    expect(callArg.subject).toContain("Welcome to CoachKen Swim Club");
    expect(callArg.html).toContain("TempPassword123!");
    expect(callArg.text).toContain("TempPassword123!");
  });

  it("handles sendMail failure gracefully without throwing", async () => {
    const t = convexTest(schema, modules);
    sendMailMock.mockResolvedValue({ ok: false, error: "SMTP connect error" });

    await expect(
      t.action(internal.accountEmailsActions.sendAccountCreationEmail, {
        toEmail: "student@example.com",
        name: "Student One",
        password: "TempPassword123!",
      }),
    ).resolves.toBeNull();

    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe("students.create schedules welcome email", () => {
  it("schedules welcome email when coach creates a student", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const coachId = await seedCoach(t);
    const asCoach = t.withIdentity({ subject: coachId });
    sendMailMock.mockResolvedValue({ ok: true, messageId: "<msg-created>" });

    const result = await asCoach.action(api.students.create, {
      name: "Jordan Lee",
      email: "jordan@example.com",
      password: "Password999!",
      status: "active",
    });

    expect(result.studentId).toBeDefined();

    // Drain scheduled background jobs
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(100);
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe("jordan@example.com");
    expect(call.subject).toContain("Welcome to CoachKen Swim Club");
    expect(call.html).toContain("Jordan Lee");
    expect(call.html).toContain("Password999!");
  });
});
