// app/parent/report/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Suspense } from "react";
import { Download, Printer, ShieldAlert, Waves } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ReportEmailPayload } from "@/convex/lib/reportEmail";
import { formatMeters, formatTime } from "@/convex/lib/reportEmail";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function ParentReportContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const reportData = useQuery(
    api.parentEmails.getByToken,
    token ? { token } : "skip",
  );

  if (!token || reportData === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Report Link Expired or Invalid</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This parent report link could not be found. Please make sure you used the
          full link from your weekly email or contact the coach for assistance.
        </p>
      </div>
    );
  }

  if (reportData === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const payload = JSON.parse(reportData.payloadJson) as ReportEmailPayload;
  const { card, weekStart } = payload;
  const csvDownloadUrl = `/api/parent-report/csv?token=${encodeURIComponent(token)}`;

  const attendancePct =
    card.attendance.percentage === null ? "—" : `${card.attendance.percentage}%`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8 print:p-0 print:space-y-4">
      {/* Top Header / Actions */}
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between print:border-b-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary print:hidden">
            <Waves className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {card.student.name}
              </h1>
              {card.groupName && (
                <Badge variant="secondary" className="text-xs">
                  {card.groupName}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Weekly Progress Report · Week of {formatDate(weekStart)}
              {card.student.age !== null ? ` · Age ${card.student.age}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
          <Button asChild className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <a href={csvDownloadUrl} download>
              <Download className="h-4 w-4" />
              Download Excel / CSV
            </a>
          </Button>
        </div>
      </div>

      {/* Attendance & Commitment KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="print:shadow-none print:border">
          <CardHeader className="p-4 pb-1">
            <p className="text-xs font-medium text-muted-foreground">Attendance Rate</p>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-2xl font-bold tabular-nums text-primary">{attendancePct}</p>
            <p className="text-xs text-muted-foreground">
              {card.attendance.attended} of {card.attendance.total} sessions
            </p>
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="p-4 pb-1">
            <p className="text-xs font-medium text-muted-foreground">Group Commitment</p>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-2xl font-bold tabular-nums">
              {card.commitment ? `${card.commitment.percentage ?? "—"}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {card.commitment
                ? `${card.commitment.attended} of ${card.commitment.held} held practices`
                : "No group assigned"}
            </p>
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="p-4 pb-1">
            <p className="text-xs font-medium text-muted-foreground">Personal Bests</p>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-2xl font-bold tabular-nums">{card.pbs.length}</p>
            <p className="text-xs text-muted-foreground">Events recorded</p>
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="p-4 pb-1">
            <p className="text-xs font-medium text-muted-foreground">Active Goals</p>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-2xl font-bold tabular-nums">{card.goals.length}</p>
            <p className="text-xs text-muted-foreground">Training targets</p>
          </CardContent>
        </Card>
      </div>

      {/* 12-Week Training Volume */}
      <Card className="print:shadow-none print:border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Training Volume (Last {card.volumeByWeek.length} Weeks)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {card.volumeByWeek.map((vol, idx) => {
              const isLatest = idx === card.volumeByWeek.length - 1;
              return (
                <div
                  key={vol.label}
                  className={`rounded-lg border p-2.5 text-center ${
                    isLatest ? "border-primary/50 bg-primary/5 font-medium" : ""
                  }`}
                >
                  <p className="text-[11px] text-muted-foreground">{vol.label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {formatMeters(vol.value)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stroke Skills Progress */}
      {card.skills.length > 0 && (
        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Stroke Skills Progression</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {card.skills.map((skill) => (
                <div key={skill.name} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{skill.name}</span>
                    <span className="font-semibold text-primary tabular-nums">
                      {skill.progress}%
                    </span>
                  </div>
                  <Progress value={skill.progress} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal Bests */}
      {card.pbs.length > 0 && (
        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Personal Bests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Event</th>
                    <th className="py-2 text-right font-medium">Best Time</th>
                    <th className="py-2 text-right font-medium">Date Set</th>
                    <th className="py-2 text-right font-medium">Recorded Swims</th>
                  </tr>
                </thead>
                <tbody>
                  {card.pbs.map((pb) => (
                    <tr key={pb.label} className="border-b last:border-0">
                      <td className="py-2 font-medium">{pb.label}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-primary">
                        {formatTime(pb.bestTimeMs)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        {formatDate(pb.bestDate)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{pb.resultCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Training Goals */}
      {card.goals.length > 0 && (
        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Training Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {card.goals.map((goal) => (
                <div
                  key={goal.title}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{goal.title}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {goal.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {goal.targetDate && (
                      <p className="text-xs text-muted-foreground">
                        Target Date: {formatDate(goal.targetDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:w-48">
                    <Progress value={goal.progress} className="h-2 flex-1" />
                    <span className="text-xs font-semibold tabular-nums">{goal.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="pt-4 text-center text-xs text-muted-foreground print:pt-6">
        <p>CoachKen Tracker · Swimmer Training &amp; Progress Platform</p>
      </div>
    </div>
  );
}

export default function ParentReportPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      }
    >
      <ParentReportContent />
    </Suspense>
  );
}
