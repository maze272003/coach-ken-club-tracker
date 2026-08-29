"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  WeeklyReportCard,
  type WeeklyPayload,
} from "@/components/coach/weekly-report-card";

export default function CoachReportsPage() {
  const result = useQuery(api.reports.list, {});
  const emailStatus = useQuery(api.parentEmails.weekStatus, {});
  const triggerEmails = useMutation(api.parentEmails.triggerNow);
  const [sending, setSending] = useState(false);

  const onSendEmails = async () => {
    setSending(true);
    try {
      const r = await triggerEmails({});
      toast.success(
        r.enqueued > 0
          ? `Queued ${r.enqueued} parent email${r.enqueued === 1 ? "" : "s"} for the week of ${r.weekStart}`
          : `All parent emails for the week of ${r.weekStart} are already queued`,
      );
    } catch {
      toast.error("Failed to queue parent emails");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Weekly Reports"
        description="Auto-generated every Monday at 06:00."
        actions={
          <div className="flex gap-2 print:hidden">
            <Button
              className="gap-2"
              disabled={sending}
              onClick={() => void onSendEmails()}
            >
              <Mail className="h-4 w-4" />
              {sending ? "Queueing…" : "Send parent emails"}
            </Button>
            <Button
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        }
      />

      {emailStatus !== undefined && (
        <p className="text-sm text-muted-foreground print:hidden">
          Parent emails (week of {emailStatus.weekStart}): {emailStatus.sent} sent ·{" "}
          {emailStatus.pending} queued · {emailStatus.failed} failed
        </p>
      )}

      {result === undefined ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : result.reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="The first report is generated at the next Monday 06:00 run."
        />
      ) : (
        <div className="space-y-6">
          {result.reports.map((report) => (
            <WeeklyReportCard
              key={report._id}
              payload={JSON.parse(report.payloadJson) as WeeklyPayload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
