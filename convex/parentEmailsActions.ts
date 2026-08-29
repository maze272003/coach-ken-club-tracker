"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { sendMail } from "./lib/mailer";
import { renderReportEmail, type ReportEmailPayload } from "./lib/reportEmail";
import { DRIP_INTERVAL_MS } from "./parentEmails";

type SendOutcome =
  | { id: Id<"parentEmails">; ok: true }
  | { id: Id<"parentEmails">; ok: false; error: string };

/**
 * Node action: sends one claimed batch via SMTP, records per-row
 * outcomes, and reschedules itself while pending rows remain.
 * Duplicate concurrent runs are safe — claimed rows leave the due
 * set atomically inside claimBatch.
 */
export const processBatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const claimed = await ctx.runMutation(internal.parentEmails.claimBatch, {});
    if (claimed.length === 0) return null;

    const results: SendOutcome[] = [];
    for (const row of claimed) {
      const payload = JSON.parse(row.payloadJson) as ReportEmailPayload;
      const { subject, html, text } = renderReportEmail(payload);
      const sent = await sendMail({ to: row.toEmail, subject, html, text });
      results.push(
        sent.ok
          ? { id: row._id, ok: true }
          : { id: row._id, ok: false, error: sent.error },
      );
    }
    await ctx.runMutation(internal.parentEmails.recordResults, { results });

    const pendingLeft = await ctx.runQuery(internal.parentEmails.hasPending, {});
    if (pendingLeft) {
      await ctx.scheduler.runAfter(
        DRIP_INTERVAL_MS,
        internal.parentEmailsActions.processBatch,
        {},
      );
    }
    return null;
  },
});
