// app/coach/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Search,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CompletePracticeDialog } from "@/components/coach/complete-practice-dialog";
import { NeedsAttentionCard } from "@/components/coach/needs-attention-card";
import {
  WeeklyReportCard,
  type WeeklyPayload,
} from "@/components/coach/weekly-report-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime, todayDateString } from "@/lib/format";

const activityIcons = {
  attendance: ClipboardCheck,
  session: Dumbbell,
  skill: Activity,
  goal: Target,
} as const;

function DeltaArrow({ delta, suffix = "" }: { delta: number | null; suffix?: string }) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {up ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

export default function CoachDashboardPage() {
  const overview = useQuery(api.dashboard.coachOverview, {});
  const reports = useQuery(api.reports.list, {});
  const [search, setSearch] = useState("");
  const students = useQuery(api.students.list, { search });
  const upcomingPractices = useQuery(api.practices.listUpcoming, {
    fromDate: todayDateString(),
  });

  const activity = useMemo(() => overview?.recentActivity ?? [], [overview]);

  const today = todayDateString();
  const todaysPractices = (upcomingPractices ?? []).filter(
    (p) => p.date === today,
  );
  const nextPractices = (upcomingPractices ?? [])
    .filter((p) => p.date > today)
    .slice(0, 5);

  const attendanceDelta =
    overview?.kpis.attendanceThisMonth !== null &&
    overview?.kpis.attendanceThisMonth !== undefined &&
    overview?.kpis.attendanceLastMonth !== null
      ? overview.kpis.attendanceThisMonth - overview.kpis.attendanceLastMonth
      : null;
  const volumeDelta =
    overview?.kpis.volumeThisWeek !== null &&
    overview?.kpis.volumeThisWeek !== undefined &&
    overview?.kpis.volumeLastWeek !== null
      ? overview.kpis.volumeThisWeek - overview.kpis.volumeLastWeek
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How are your swimmers progressing?"
        actions={
          <Link href="/coach/times">
            <Button variant="outline" className="gap-2">
              <Timer className="h-4 w-4 text-amber-500" />
              Run Time Trial
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
            Today&apos;s Practices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingPractices === undefined ? (
            <Skeleton className="h-14" />
          ) : todaysPractices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No practices scheduled today.{" "}
              <Link
                href="/coach/practices"
                className="underline hover:text-foreground"
              >
                Schedule one
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y">
              {todaysPractices.map((practice) => (
                <li
                  key={practice._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{practice.title}</span>
                      <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-400">
                        {practice.plannedDurationMinutes} min
                        {practice.plannedDistanceMeters !== null
                          ? ` · ${practice.plannedDistanceMeters.toLocaleString()} m`
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {practice.groupName}
                      {practice.startTime ? ` at ${practice.startTime}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CompletePracticeDialog practice={practice} />
                    <Link
                      href="/coach/attendance"
                      className="text-sm underline text-muted-foreground hover:text-foreground"
                    >
                      Roll call
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <NeedsAttentionCard />

          {overview === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={ClipboardCheck}
                label="Attendance"
                value={
                  overview.kpis.attendanceThisMonth === null
                    ? "—"
                    : `${overview.kpis.attendanceThisMonth}%`
                }
                hint="This month, whole team"
              />
              <StatCard
                icon={Waves}
                label="Weekly volume"
                value={
                  overview.kpis.volumeThisWeek === null
                    ? "—"
                    : `${overview.kpis.volumeThisWeek.toLocaleString()} m`
                }
                hint="vs last week"
              />
              <StatCard
                icon={Timer}
                label="PBs this month"
                value={String(overview.stats.pbsThisMonth)}
                hint="New personal bests"
              />
              <StatCard
                icon={Users}
                label="Active swimmers"
                value={String(overview.stats.activeStudents)}
                hint={`${overview.stats.totalStudents} total`}
              />
            </div>
          )}

          {overview !== undefined && (attendanceDelta !== null || volumeDelta !== null) && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {attendanceDelta !== null && (
                <span className="inline-flex items-center gap-1.5">
                  Attendance vs last month <DeltaArrow delta={attendanceDelta} suffix=" pts" />
                </span>
              )}
              {volumeDelta !== null && (
                <span className="inline-flex items-center gap-1.5">
                  Volume vs last week{" "}
                  <DeltaArrow delta={volumeDelta} suffix=" m" />
                </span>
              )}
            </div>
          )}

          {reports !== undefined && reports.reports.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                    Last week
                  </span>
                  <Link
                    href="/coach/reports"
                    className="text-sm underline text-muted-foreground hover:text-foreground"
                  >
                    All reports
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WeeklyReportCard
                  payload={JSON.parse(reports.reports[0]!.payloadJson) as WeeklyPayload}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No activity yet"
                  description="Attendance, sessions, skills and goals will appear here as you record them."
                  className="border-0 py-6"
                />
              ) : (
                <ul className="space-y-3">
                  {activity.map((item, i) => {
                    const Icon = activityIcons[item.kind];
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Icon
                            className="size-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm">
                            <span className="font-medium">{item.studentName}</span>{" "}
                            <span className="text-muted-foreground">{item.detail}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(item.atMs)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4 text-muted-foreground" aria-hidden="true" />
                Goal deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview === undefined ? (
                <Skeleton className="h-16" />
              ) : overview.goalDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming deadlines in the next 14 days.
                </p>
              ) : (
                <ul className="divide-y">
                  {overview.goalDeadlines.map((goal, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{goal.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {goal.studentName}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatDate(goal.targetDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Next practices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingPractices === undefined ? (
                <Skeleton className="h-16" />
              ) : nextPractices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled after today.{" "}
                  <Link
                    href="/coach/practices"
                    className="underline hover:text-foreground"
                  >
                    Plan one
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y">
                  {nextPractices.map((practice) => (
                    <li
                      key={practice._id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {practice.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {practice.groupName}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatDate(practice.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <CardTitle className="text-base">Students</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search students…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </div>
        </CardHeader>
        <CardContent>
          {students === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search !== "" ? "No matching students" : "No students yet"}
              description={
                search !== ""
                  ? "Try a different name or email."
                  : "Create your first student to start tracking progress."
              }
              className="border-0 py-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden sm:table-cell">Attendance</TableHead>
                    <TableHead className="hidden md:table-cell">Progress</TableHead>
                    <TableHead className="hidden lg:table-cell">Current goal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell>
                        <Link
                          href={`/coach/students/${student.studentId}`}
                          className="flex items-center gap-2 font-medium hover:underline"
                        >
                          <StudentAvatar
                            name={student.name}
                            image={student.image}
                            className="size-7"
                          />
                          <span className="max-w-32 truncate sm:max-w-none">
                            {student.name}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {student.attendancePercentage === null ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <span className="text-sm font-medium tabular-nums">
                            {student.attendancePercentage}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {student.overallProgress === null ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <span className="text-sm font-medium tabular-nums">
                            {student.overallProgress}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="block max-w-48 truncate text-sm text-muted-foreground">
                          {student.currentGoalTitle ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={student.status === "active" ? "default" : "secondary"}
                        >
                          {student.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
