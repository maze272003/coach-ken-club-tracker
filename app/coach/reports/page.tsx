// app/coach/reports/page.tsx
"use client";

import { useQuery } from "convex/react";
import { FileText, Printer } from "lucide-react";
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

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Weekly Reports"
        description="Auto-generated every Monday at 06:00."
        actions={
          <Button
            variant="outline"
            className="gap-2 print:hidden"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        }
      />

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
