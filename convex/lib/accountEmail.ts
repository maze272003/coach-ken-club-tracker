// convex/lib/accountEmail.ts

export type AccountCreationEmailPayload = {
  name: string;
  email: string;
  password: string;
  loginUrl?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAccountCreationEmail(payload: AccountCreationEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, email, password, loginUrl } = payload;
  const subject = "Welcome to CoachKen Swim Club — Your Account Credentials";
  const loginHref = loginUrl || "/login";

  const buttonHtml = `<div style="margin:24px 0;">
  <a href="${esc(loginHref)}" style="display:inline-block;background-color:#0284c7;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;">🏊 Sign In to Tracker</a>
</div>`;

  const html = `<!doctype html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:16px;line-height:1.5;">
  <h2 style="color:#0284c7;margin:0 0 8px 0;">Welcome to CoachKen Swim Club!</h2>
  <p style="margin:0 0 16px 0;">Hi <strong>${esc(name)}</strong>,</p>
  <p style="margin:0 0 16px 0;">Your student account has been created by your coach. You can now log in to view your training attendance, stroke skill progress, training goals, and personal best times.</p>
  
  <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:20px 0;">
    <h3 style="margin:0 0 12px 0;font-size:15px;color:#0369a1;">Your Login Credentials</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:#555;width:140px;"><strong>Email (Login):</strong></td>
        <td style="padding:4px 0;color:#111;font-family:monospace,monospace;">${esc(email)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#555;width:140px;"><strong>Temporary Password:</strong></td>
        <td style="padding:4px 0;color:#111;font-family:monospace,monospace;background-color:#e0f2fe;padding:2px 6px;border-radius:4px;display:inline-block;">${esc(password)}</td>
      </tr>
    </table>
  </div>

  ${buttonHtml}

  <p style="margin:16px 0 0 0;font-size:13px;color:#666;">
    <strong>Next steps:</strong> After signing in, you can update your avatar and profile details.
  </p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px 0;" />
  <p style="color:#888;font-size:12px;margin:0;">Sent by CoachKen Tracker. If you have questions, please reach out to your coach.</p>
</body>
</html>`;

  const text = `Welcome to CoachKen Swim Club!

Hi ${name},

Your student account has been created by your coach. You can now log in to view your training attendance, stroke skill progress, training goals, and personal best times.

YOUR LOGIN CREDENTIALS:
- Email (Login): ${email}
- Temporary Password: ${password}

Log in at: ${loginHref}

Next steps: After signing in, you can update your avatar and profile details.

---
Sent by CoachKen Tracker. If you have questions, please reach out to your coach.`;

  return { subject, html, text };
}
