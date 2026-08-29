// components/coach/student-trends-tab.tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { LineChart } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  AttendanceBarChart,
  PbProgressionChart,
  SkillRadarChart,
  VolumeLineChart,
} from "@/components/shared/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function StudentTrendsTab({ studentId }: { studentId: string }) {
  const trends = useQuery(api.insights.studentTrends, {
    studentId: studentId as never,
  });
  const [eventLabel, setEventLabel] = useState<string>("");

  if (trends === undefined) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const selected =
    trends.pbProgression.find((e) => e.label === eventLabel) ??
    trends.pbProgression[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Attendance by month (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceBarChart data={trends.attendanceByMonth} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Weekly volume (m)</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumeLineChart data={trends.volumeByWeek} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Skill levels</CardTitle>
          </CardHeader>
          <CardContent>
            {trends.skillRadar.length < 3 ? (
              <EmptyState
                icon={LineChart}
                title="Not enough skills yet"
                description="At least three skill assessments are needed for the radar."
                className="border-0 py-6"
              />
            ) : (
              <SkillRadarChart data={trends.skillRadar} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">PB progression</CardTitle>
            {trends.pbProgression.length > 0 && (
              <Select value={selected?.label ?? ""} onValueChange={(v) => setEventLabel(v)}>
                <SelectTrigger className="w-full" aria-label="Event">
                  <SelectValue placeholder="Event" />
                </SelectTrigger>
                <SelectContent>
                  {trends.pbProgression.map((event) => (
                    <SelectItem key={event.label} value={event.label}>
                      {event.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {selected ? (
              <PbProgressionChart points={selected.points} />
            ) : (
              <EmptyState
                icon={LineChart}
                title="No event history yet"
                description="Record at least two results for one event to see progression."
                className="border-0 py-6"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
