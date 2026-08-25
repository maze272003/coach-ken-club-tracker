"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Gauge, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SkillsEditor } from "@/components/coach/skills-editor";
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

export default function CoachSkillsPage() {
  const students = useQuery(api.students.list, {});
  const [selected, setSelected] = useState<string | null>(null);

  const activeStudents = (students ?? []).filter(
    (s) => s.status === "active",
  );
  const studentId =
    selected !== null && activeStudents.some((s) => s.studentId === selected)
      ? selected
      : activeStudents[0]?.studentId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        description="Update stroke skill progress for your swimmers."
      />

      {students === undefined ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : activeStudents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active students"
          description="Create students to start tracking their stroke skills."
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="skills-student">Student</Label>
              <Select
                value={studentId ?? undefined}
                onValueChange={setSelected}
              >
                <SelectTrigger id="skills-student" className="w-full">
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
          {studentId !== null ? (
            <SkillsEditor key={studentId} studentId={studentId} />
          ) : (
            <EmptyState
              icon={Gauge}
              title="Select a student"
              description="Choose a student to edit their stroke skill progress."
            />
          )}
        </>
      )}
    </div>
  );
}
