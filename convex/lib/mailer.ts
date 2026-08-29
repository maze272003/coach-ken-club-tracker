// convex/lib/mailer.ts
// Node-only module (imported exclusively by useNode actions).
import nodemailer, { type Transporter } from "nodemailer";

export type SendMailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (cachedTransport === null) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return cachedTransport;
}

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { ok: false, error: "SMTP not configured (set SMTP_USER and SMTP_PASS)" };
  }
  try {
    const info = await getTransport().sendMail({
      from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
      replyTo: process.env.SMTP_USER,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}
