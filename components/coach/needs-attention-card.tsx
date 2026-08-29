// components/coach/needs-attention-card.tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const severityStyles: Record<string, string> = {
  high: "bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400",
  low: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400",
};

export function NeedsAttentionCard() {
  const result = useQuery(api.insights.coachAttentionFlags, {});

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
          Needs Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {result === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : result.flags.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nobody needs attention right now"
            description="Flags appear here for absences, attendance drops, plateaus, goal deadlines, and inactivity."
            className="border-0 py-6"
          />
        ) : (
          <ul className="divide-y">
            {result.flags.map((flag, i) => (
              <li key={i}>
                <Link
                  href={`/coach/students/${flag.studentId}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{flag.studentName}</p>
                    <p className="text-sm text-muted-foreground">{flag.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        severityStyles[flag.severity] ?? severityStyles.low
                      }`}
                    >
                      {flag.severity}
                    </span>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
