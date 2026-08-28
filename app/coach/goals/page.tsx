"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Target, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { GoalCard } from "@/components/shared/goal-card";
import { GoalFormDialog } from "@/components/coach/goal-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeMs } from "@/lib/format";


export default function CoachGoalsPage() {
  const students = useQuery(api.students.list, {});
  const [selected, setSelected] = useState<string | null>(null);

  const activeStudents = (students ?? []).filter((s) => s.status === "active");
  const studentId =
    selected !== null && activeStudents.some((s) => s.studentId === selected)
      ? selected
      : activeStudents[0]?.studentId ?? null;

  const goals = useQuery(
    api.goals.listForStudent,
    studentId !== null ? { studentId: studentId as never } : "skip",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="Create and update training goals for your swimmers."
        actions={
          studentId !== null ? (
            <GoalFormDialog
              fixedStudentId={studentId}
              triggerLabel="New Goal"
            />
          ) : undefined
        }
      />

      {students === undefined ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : activeStudents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active students"
          description="Create students before assigning training goals."
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="goals-student">Student</Label>
              <Select
                value={studentId ?? undefined}
                onValueChange={setSelected}
              >
                <SelectTrigger id="goals-student" className="w-full">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {activeStudents.map((s) => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          {studentId === null ? (
            <EmptyState
              icon={Target}
              title="Select a student"
              description="Choose a student to manage their training goals."
            />
          ) : goals === undefined ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No goals yet"
              description="Assign the first training goal for this swimmer."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {goals.map((goal) => (
                <GoalCard
                  key={goal._id}
                  goal={goal}
                  footer={
                    <GoalFormDialog
                      fixedStudentId={studentId}
                      goalId={goal._id}
                      initial={{
                        studentId,
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
        </>
      )}
    </div>
  );
}
