// components/coach/weekly-report-card.tsx
"use client";

import { CalendarCheck, ClipboardCheck, Flag, Timer, Waves } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

type GroupReport = {
  groupName: string;
  practicesHeld: number;
  attendancePct: number | null;
  volumeMeters: number;
  pbs: number;
  flagsRaised: number;
};

export type WeeklyPayload = {
  weekStart: string;
  team: {
    practicesHeld: number;
    attendancePct: number | null;
    volumeMeters: number;
    pbs: number;
    flagsRaised: number;
  };
  groups: GroupReport[];
  errors: { groupName: string; error: string }[];
};

export function WeeklyReportCard({ payload }: { payload: WeeklyPayload }) {
  const kpis = [
    { label: "Practices held", value: String(payload.team.practicesHeld) },
    {
      label: "Attendance",
      value:
        payload.team.attendancePct === null ? "—" : `${payload.team.attendancePct}%`,
    },
    { label: "Volume", value: `${payload.team.volumeMeters.toLocaleString()} m` },
    { label: "PBs", value: String(payload.team.pbs) },
    { label: "Flags raised", value: String(payload.team.flagsRaised) },
  ];

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Week of {formatDate(payload.weekStart)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
        {payload.groups.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Group</th>
                <th className="py-1.5 font-medium">Practices</th>
                <th className="py-1.5 font-medium">Attendance</th>
                <th className="py-1.5 font-medium">Volume</th>
                <th className="py-1.5 font-medium">PBs</th>
                <th className="py-1.5 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {payload.groups.map((group) => (
                <tr key={group.groupName} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{group.groupName}</td>
                  <td className="py-1.5 tabular-nums">{group.practicesHeld}</td>
                  <td className="py-1.5 tabular-nums">
                    {group.attendancePct === null ? "—" : `${group.attendancePct}%`}
                  </td>
                  <td className="py-1.5 tabular-nums">
                    {group.volumeMeters.toLocaleString()} m
                  </td>
                  <td className="py-1.5 tabular-nums">{group.pbs}</td>
                  <td className="py-1.5 tabular-nums">{group.flagsRaised}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {payload.errors.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {payload.errors.length} group(s) failed to compute:{" "}
            {payload.errors.map((e) => `${e.groupName} (${e.error})`).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
