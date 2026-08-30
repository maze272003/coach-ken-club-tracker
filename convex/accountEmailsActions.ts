"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { sendMail } from "./lib/mailer";
import { renderAccountCreationEmail } from "./lib/accountEmail";

export const sendAccountCreationEmail = internalAction({
  args: {
    toEmail: v.string(),
    name: v.string(),
    password: v.string(),
    loginUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { subject, html, text } = renderAccountCreationEmail({
      name: args.name,
      email: args.toEmail,
      password: args.password,
      loginUrl: args.loginUrl,
    });

    const result = await sendMail({
      to: args.toEmail,
      subject,
      html,
      text,
    });

    if (!result.ok) {
      console.warn(
        `Failed to send account creation email to ${args.toEmail}: ${result.error}`,
      );
    }
    return null;
  },
});
