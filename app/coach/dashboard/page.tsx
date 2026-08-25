"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  ClipboardCheck,
  Dumbbell,
  Gauge,
  Search,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
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
import { formatRelativeTime } from "@/lib/format";

const activityIcons = {
  attendance: ClipboardCheck,
  session: Dumbbell,
  skill: Gauge,
  goal: Target,
} as const;

export default function CoachDashboardPage() {
  const overview = useQuery(api.dashboard.coachOverview, {});
  const [search, setSearch] = useState("");
  const students = useQuery(api.students.list, { search });

  const activity = useMemo(() => overview?.recentActivity ?? [], [overview]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How are your swimmers progressing?"
      />

      {overview === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Total Students"
            value={String(overview.stats.totalStudents)}
          />
          <StatCard
            icon={UserRound}
            label="Active Students"
            value={String(overview.stats.activeStudents)}
          />
          <StatCard
            icon={ClipboardCheck}
            label="Average Attendance"
            value={
              overview.stats.averageAttendance === null
                ? "—"
                : `${overview.stats.averageAttendance}%`
            }
            hint="Across students with records"
          />
          <StatCard
            icon={Dumbbell}
            label="Training Sessions"
            value={String(overview.stats.totalSessions)}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : activity.length === 0 ? (
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
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm">
                          <span className="font-medium">{item.studentName}</span>{" "}
                          <span className="text-muted-foreground">
                            {item.detail}
                          </span>
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

        <Card className="lg:col-span-2">
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
    </div>
  );
}
