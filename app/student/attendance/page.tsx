"use client";

import { useQuery } from "convex/react";
import { CalendarCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AttendanceSummary } from "@/components/shared/attendance-summary";
import { AttendanceBadge } from "@/components/shared/attendance-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

export default function StudentAttendancePage() {
  const data = useQuery(api.attendance.my, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Your attendance history, recorded by your coach."
      />

      {data === undefined ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : data.stats.total === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No attendance yet"
          description="Your coach hasn't recorded any attendance for you yet."
        />
      ) : (
        <>
          <AttendanceSummary stats={data.stats} />
          <Card>
            <CardContent>
              <h2 className="mb-3 text-sm font-semibold">History</h2>
              <ul className="divide-y">
                {data.records.map((record) => (
                  <li
                    key={record._id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="text-sm">{formatDate(record.date)}</span>
                    <AttendanceBadge status={record.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
