// app/coach/students/[id]/report/page.tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatTimeMs } from "@/lib/format";

export default function AthleteReportPage() {
  const params = useParams<{ id: string }>();
  const card = useQuery(api.reports.athleteCard, {
    studentId: params.id as never,
  });

  if (card === undefined) {
    return <Skeleton className="h-96 rounded-xl" />;
  }
  if (card === null) {
    return (
      <EmptyState
        icon={ArrowLeft}
        title="Student not found"
        description="This student may have been removed."
      />
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/coach/students/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to student
        </Link>
        <Button variant="outline" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Athlete Report — {card.student.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {card.groupName ?? "No group"}
          {card.student.age !== null ? ` · ${card.student.age} yrs` : ""}
          {card.student.joinedAt ? ` · joined ${formatDate(card.student.joinedAt)}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pb-4 pt-4">
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {card.attendance.percentage === null ? "—" : `${card.attendance.percentage}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {card.attendance.attended} of {card.attendance.total} records
            </p>
          </CardContent>
        </Card>
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pb-4 pt-4">
            <p className="text-xs text-muted-foreground">Commitment</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {card.commitment === null || card.commitment.percentage === null
                ? "—"
                : `${card.commitment.percentage}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {card.commitment === null
                ? "Assign a group to track"
                : `${card.commitment.attended} of ${card.commitment.held} practices`}
            </p>
          </CardContent>
        </Card>
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pb-4 pt-4">
            <p className="text-xs text-muted-foreground">Personal bests</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{card.pbs.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Skills</CardTitle>
          </CardHeader>
          <CardContent>
            {card.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill records.</p>
            ) : (
              <ul className="space-y-1.5">
                {card.skills.map((skill) => (
                  <li key={skill.name} className="flex justify-between text-sm">
                    <span>{skill.name}</span>
                    <span className="font-medium tabular-nums">{skill.progress}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Personal bests</CardTitle>
          </CardHeader>
          <CardContent>
            {card.pbs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No times recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {card.pbs.map((pb) => (
                  <li key={pb.label} className="flex justify-between text-sm">
                    <span>{pb.label}</span>
                    <span className="font-medium tabular-nums">
                      {formatTimeMs(pb.bestTimeMs)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({formatDate(pb.bestDate)})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Weekly volume (last 12 weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
            {card.volumeByWeek.map((week) => (
              <li key={week.label} className="flex justify-between">
                <span className="text-muted-foreground">{week.label.slice(5)}</span>
                <span className="tabular-nums">
                  {week.value === null ? "—" : `${week.value.toLocaleString()} m`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Goals</CardTitle>
        </CardHeader>
        <CardContent>
          {card.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals set.</p>
          ) : (
            <ul className="space-y-1.5">
              {card.goals.map((goal) => (
                <li key={goal.title} className="flex justify-between text-sm">
                  <span>
                    {goal.title}
                    {goal.targetDate ? ` (due ${formatDate(goal.targetDate)})` : ""}
                  </span>
                  <span className="tabular-nums">
                    {goal.progress}% · {goal.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
