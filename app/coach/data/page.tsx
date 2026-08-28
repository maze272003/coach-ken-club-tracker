"use client";

import { useQuery } from "convex/react";
import { Database, DatabaseZap, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const countCards = [
  { key: "students", label: "Students" },
  { key: "activeStudents", label: "Active" },
  { key: "groups", label: "Groups" },
  { key: "attendance", label: "Attendance Records" },
  { key: "trainingSessions", label: "Training Sessions" },
  { key: "timeResults", label: "Time Results" },
  { key: "trainingGoals", label: "Goals" },
  { key: "strokeSkills", label: "Skill Records" },
] as const;

const practiceStatuses = [
  { key: "practicesCompleted", label: "Completed" },
  { key: "practicesPlanned", label: "Planned" },
  { key: "practicesCancelled", label: "Cancelled" },
] as const;

export default function CoachDataPage() {
  const status = useQuery(api.seed.status, {});
  const summary = useQuery(api.dataOverview.summary, {});

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        title="Data & Seed Overview"
        description="Verify table counts, demo accounts, and per-swimmer data coverage after a seed or migration."
      />

      {status === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {countCards.map((c) => (
            <Skeleton key={c.key} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {countCards.map((card) => (
              <Card key={card.key}>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-3xl font-semibold tabular-nums">
                    {status.counts[card.key]}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Database className="h-4 w-4 text-primary" />
                  Practices
                </CardTitle>
                <CardDescription>
                  {status.counts.practices} total practice records by status
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {practiceStatuses.map((p) => (
                  <Badge key={p.key} variant="secondary" className="gap-1.5">
                    {p.label}: {status.counts[p.key]}
                  </Badge>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <DatabaseZap className="h-4 w-4 text-primary" />
                  Demo Accounts
                </CardTitle>
                <CardDescription>
                  Demo seed presence (password{" "}
                  <code className="font-mono">swim-demo-2026</code>)
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {status.demoAccounts.map((account) => (
                  <Badge
                    key={account.email}
                    variant={account.exists ? "default" : "outline"}
                    className={
                      account.exists
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : "text-muted-foreground"
                    }
                  >
                    {account.email.split("@")[0]}
                    {account.exists ? " ✓" : " —"}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {summary !== undefined && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Groups</CardTitle>
            <CardDescription>
              Training groups with member and practice counts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.groups.length === 0 ? (
              <EmptyState
                icon={Database}
                title="No groups"
                description="Groups appear here once created or seeded."
              />
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Group</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Practices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.groups.map((group) => (
                      <TableRow key={group.groupId}>
                        <TableCell className="font-medium">
                          {group.name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[360px]">
                          {group.description ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              group.status === "active"
                                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "text-muted-foreground"
                            }
                          >
                            {group.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {group.memberCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {group.practiceCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {summary !== undefined && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Swimmer Data Coverage
            </CardTitle>
            <CardDescription>
              Per-swimmer record counts and profile completeness for spotting
              gaps in seeded or migrated data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.students.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students"
                description="Add students or run the demo seed to populate this table."
              />
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Swimmer</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Parent Info</TableHead>
                      <TableHead>Medical</TableHead>
                      <TableHead className="text-right">Att.</TableHead>
                      <TableHead className="text-right">Att.%</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Times</TableHead>
                      <TableHead className="text-right">IM Times</TableHead>
                      <TableHead className="text-right">Skills</TableHead>
                      <TableHead className="text-right">Progress</TableHead>
                      <TableHead className="text-right">Goals</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.students.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {student.email}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {student.groupName ?? "Unassigned"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              student.hasParentContact
                                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "text-muted-foreground"
                            }
                          >
                            {student.hasParentContact ? "yes" : "missing"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              student.hasMedicalNotes
                                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "text-muted-foreground"
                            }
                          >
                            {student.hasMedicalNotes ? "yes" : "missing"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.attendedCount}/{student.attendanceCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.attendancePct === null
                            ? "—"
                            : `${student.attendancePct}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.sessionCount}
                          <span className="text-[11px] text-muted-foreground">
                            {" "}
                            ({student.sessionsWithMetrics} w/ metrics)
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.timeCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.imTimeCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.skillCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.overallProgress === null
                            ? "—"
                            : `${student.overallProgress}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.goalCount}
                          <span className="text-[11px] text-muted-foreground">
                            {" "}
                            ({student.goalsByStatus.in_progress} active,{" "}
                            {student.goalsByStatus.completed} done)
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {summary === undefined && status !== undefined && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
        </div>
      )}
    </div>
  );
}
