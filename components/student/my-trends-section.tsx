// components/student/my-trends-section.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AttendanceBarChart, VolumeLineChart } from "@/components/shared/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MyTrendsSection() {
  const trends = useQuery(api.insights.myTrends, {});

  if (trends === undefined) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">My attendance (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceBarChart data={trends.attendanceByMonth} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">My weekly volume (m)</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumeLineChart data={trends.volumeByWeek} />
        </CardContent>
      </Card>
    </div>
  );
}
