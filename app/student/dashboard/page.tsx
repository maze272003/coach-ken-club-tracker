"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  CalendarDays,
  ClipboardCheck,
  Gauge,
  Target,
  Trophy,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressRow } from "@/components/shared/progress-row";
import { GoalCard } from "@/components/shared/goal-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { useSkillCatalog } from "@/lib/use-skill-catalog";

export default function StudentDashboardPage() {
  const data = useQuery(api.dashboard.studentDashboard, {});
  const me = useQuery(api.users.currentUser, {});
  const pbs = useQuery(api.times.myPersonalBests, {});
  const { label } = useSkillCatalog();

  const firstName = (me?.name ?? "").split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Welcome, ${firstName} 👋` : "Dashboard"}
        description="How are you progressing as a swimmer?"
      />

      {data === undefined ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={ClipboardCheck}
              label="Attendance"
              value={
                data.attendance.percentage === null
                  ? "—"
                  : `${data.attendance.percentage}%`
              }
              hint={
                data.attendance.total === 0
                  ? "No sessions recorded yet"
                  : `${data.attendance.attended} of ${data.attendance.total} days attended`
              }
            />
            <StatCard
              icon={Gauge}
              label="Training Progress"
              value={
                data.overallProgress === null ? "—" : `${data.overallProgress}%`
              }
              hint={
                data.overallProgress === null
                  ? "No progress recorded yet"
                  : "Average across your skills"
              }
            />
            <StatCard
              icon={Trophy}
              label="Personal Bests"
              value={pbs === undefined ? "—" : String(pbs.length)}
              hint={
                pbs === undefined || pbs.length === 0
                  ? "No official PBs recorded"
                  : `${pbs.length} official event records`
              }
            />
          </div>


          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Skills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.skills.length === 0 ? (
                <EmptyState
                  icon={Gauge}
                  title="No skills recorded yet"
                  description="Your coach will record your skill progress here."
                  className="border-0 py-4"
                />
              ) : (
                data.skills.map((skill) => (
                  <ProgressRow
                    key={skill.key}
                    label={skill.name}
                    value={skill.progress}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Recent Training</CardTitle>
                <Link
                  href="/student/training"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  View all
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentSessions.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No training sessions yet"
                    description="Your coach hasn't recorded any sessions."
                    className="border-0 py-4"
                  />
                ) : (
                  data.recentSessions.map((session) => (
                    <div
                      key={session._id}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{session.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(session.date)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {session.durationMinutes} minutes
                        {session.strokes.length > 0
                          ? ` · ${session.strokes.map(label).join(", ")}`
                          : ""}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div>
              {data.currentGoal === null ? (
                <Card>
                  <CardContent className="p-0">
                    <EmptyState
                      icon={Target}
                      title="No current goal"
                      description="Your coach hasn't assigned a training goal yet."
                    />
                  </CardContent>
                </Card>
              ) : (
                <GoalCard goal={data.currentGoal} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
