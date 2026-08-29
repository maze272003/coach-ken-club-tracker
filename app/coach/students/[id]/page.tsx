"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  FileText,
  Gauge,
  Target,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { AttendanceBadge } from "@/components/shared/attendance-badge";
import { AttendanceSummary } from "@/components/shared/attendance-summary";
import { TrainingSessionCard } from "@/components/shared/training-session-card";
import { GoalCard } from "@/components/shared/goal-card";
import { AttendanceForm } from "@/components/coach/attendance-form";
import { SkillsEditor } from "@/components/coach/skills-editor";
import { SessionFormDialog } from "@/components/coach/session-form-dialog";
import { GoalFormDialog } from "@/components/coach/goal-form-dialog";
import { StudentTimesTab } from "@/components/coach/student-times-tab";
import { StudentTrendsTab } from "@/components/coach/student-trends-tab";
import {
  EditStudentDialog,
  ResetPasswordDialog,
} from "@/components/coach/edit-student-dialog";
import { ExportAttendanceDialog } from "@/components/coach/export-attendance-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ageYears, formatDate, formatTimeMs } from "@/lib/format";


export default function CoachStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const student = useQuery(api.students.get, {
    studentId: studentId as never,
  });
  const attendance = useQuery(api.attendance.listForStudent, {
    studentId: studentId as never,
  });
  const skills = useQuery(api.skills.listForStudent, {
    studentId: studentId as never,
  });
  const sessions = useQuery(api.training.listForStudent, {
    studentId: studentId as never,
  });
  const goals = useQuery(api.goals.listForStudent, {
    studentId: studentId as never,
  });

  if (student === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (student === null) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Student not found"
        description="This student may have been removed."
        action={
          <Link href="/coach/students" className="text-sm underline">
            Back to students
          </Link>
        }
      />
    );
  }

  const overallProgress =
    skills === undefined || skills.length === 0
      ? null
      : Math.round(
          skills.reduce((acc, s) => acc + s.progress, 0) / skills.length,
        );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/coach/students"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Students
        </Link>
      </div>

      <PageHeader
        title={student.name}
        description={student.email}
        actions={
          <>
            <Link href={`/coach/students/${student.studentId}/report`}>
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Report card
              </Button>
            </Link>
            <EditStudentDialog
              studentId={student.studentId}
              initial={{
                name: student.name,
                status: student.status,
                image: student.image ?? "",
                groupId: student.groupId,
                dateOfBirth: student.dateOfBirth ?? "",
                sex: student.sex ?? "unset",
                parentName: student.parentName ?? "",
                parentPhone: student.parentPhone ?? "",
                parentEmail: student.parentEmail ?? "",
                joinedAt: student.joinedAt ?? "",
                medicalNotes: student.medicalNotes ?? "",
              }}
            />
            <ResetPasswordDialog studentId={student.studentId} />
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <StudentAvatar
            name={student.name}
            image={student.image}
            className="size-14"
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Badge variant={student.status === "active" ? "default" : "secondary"}>
              {student.status === "active" ? "Active" : "Inactive"}
            </Badge>
            {student.groupName ? (
              <Badge variant="outline">{student.groupName}</Badge>
            ) : null}
            {student.dateOfBirth ? (
              <span className="text-muted-foreground">
                {ageYears(student.dateOfBirth)} years old
              </span>
            ) : null}
            <span className="text-muted-foreground">
              Member since{" "}
              {new Date(student.createdAtMs).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
            {student.joinedAt ? (
              <span className="text-muted-foreground">
                Joined team {formatDate(student.joinedAt)}
              </span>
            ) : null}
          </div>
          {student.parentName ||
          student.parentPhone ||
          student.parentEmail ||
          student.medicalNotes ? (
            <div className="ml-auto grid gap-0.5 text-right text-sm text-muted-foreground">
              {student.parentName ? <span>{student.parentName}</span> : null}
              {student.parentPhone ? <span>{student.parentPhone}</span> : null}
              {student.parentEmail ? <span>{student.parentEmail}</span> : null}
              {student.medicalNotes ? (
                <span className="font-medium text-foreground">
                  Medical: {student.medicalNotes}
                </span>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={CalendarCheck}
          label="Attendance"
          value={
            attendance === undefined || attendance.stats.percentage === null
              ? "—"
              : `${attendance.stats.percentage}%`
          }
          hint={
            attendance === undefined
              ? undefined
              : `${attendance.stats.attended} of ${attendance.stats.total} sessions attended`
          }
        />
        <StatCard
          icon={Target}
          label="Commitment"
          value={
            student.commitment === null || student.commitment.percentage === null
              ? "—"
              : `${student.commitment.percentage}%`
          }
          hint={
            student.commitment === null
              ? "Assign a training group to track commitment"
              : student.commitment.percentage === null
                ? "No completed group practices yet"
                : `${student.commitment.attended} of ${student.commitment.held} group practices attended`
          }
        />
        <StatCard
          icon={Gauge}
          label="Overall Training Progress"
          value={
            overallProgress === null
              ? "—"
              : `${overallProgress}%`
          }
          hint={
            overallProgress === null ? "No progress recorded yet" : undefined
          }
        />
      </div>

      <Tabs defaultValue="attendance">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="times">Times & PBs</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
        </TabsList>


        <TabsContent value="attendance" className="mt-4 space-y-4">
          <AttendanceForm studentId={student.studentId} />
          {attendance === undefined ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : attendance.stats.total === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance yet"
              description="Record this student's attendance to start tracking their consistency."
            />
          ) : (
            <>
              <AttendanceSummary stats={attendance.stats} />
              <Card>
                <CardContent>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Attendance History
                    </h3>
                    <ExportAttendanceDialog
                      preselectedStudentId={student.studentId}
                    />
                  </div>
                  <ul className="divide-y">
                    {attendance.records.slice(0, 30).map((record) => (
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
        </TabsContent>

        <TabsContent value="times" className="mt-4">
          <StudentTimesTab
            studentId={student.studentId}
            studentName={student.name}
          />
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          <StudentTrendsTab studentId={student.studentId} />
        </TabsContent>

        <TabsContent value="skills" className="mt-4">

          <SkillsEditor key={student.studentId} studentId={student.studentId} />
        </TabsContent>

        <TabsContent value="training" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <SessionFormDialog
              fixedStudentId={student.studentId}
              triggerLabel="Add Session"
            />
          </div>
          {sessions === undefined ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No training sessions yet"
              description="Record the first training session for this swimmer."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sessions.map((session) => (
                <TrainingSessionCard
                  key={session._id}
                  session={session}
                  footer={
                    <SessionFormDialog
                      fixedStudentId={student.studentId}
                      sessionId={session._id}
                      initial={{
                        studentId: student.studentId,
                        date: session.date,
                        title: session.title,
                        durationMinutes: String(session.durationMinutes),
                        distanceMeters:
                          session.distanceMeters === null
                            ? ""
                            : String(session.distanceMeters),
                        intensity: session.intensity ?? "unset",
                        strokes: session.strokes,
                        notes: session.notes ?? "",
                      }}
                      triggerLabel="Edit"
                    />
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="goals" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <GoalFormDialog
              fixedStudentId={student.studentId}
              triggerLabel="Add Goal"
            />
          </div>
          {goals === undefined ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No goals yet"
              description="Assign a training goal to give this swimmer something to work towards."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {goals.map((goal) => (
                <GoalCard
                  key={goal._id}
                  goal={goal}
                  footer={
                    <GoalFormDialog
                      fixedStudentId={student.studentId}
                      goalId={goal._id}
                      initial={{
                        studentId: student.studentId,
                        title: goal.title,
                        description: goal.description ?? "",
                        type: goal.type ?? "manual",
                        stroke: goal.stroke ?? undefined,
                        distanceMeters: goal.distanceMeters ?? undefined,
                        course: goal.course ?? undefined,
                        targetTimeInput: goal.targetTimeMs ? formatTimeMs(goal.targetTimeMs) : "",
                        baselineBestInput: goal.baselineBestMs ? formatTimeMs(goal.baselineBestMs) : "",
                        targetAttendancePct: goal.targetAttendancePct ?? 90,
                        target: goal.target ?? "",
                        progress: String(goal.progress),
                        status: goal.status,
                        targetDate: goal.targetDate ?? "",
                      }}
                      triggerLabel="Edit"
                    />

                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
