"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Gauge, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SkillsEditor } from "@/components/coach/skills-editor";
import { SkillLibrary } from "@/components/coach/skill-library";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        description="Manage your skill programs and track each swimmer's progress."
      />

      <Tabs defaultValue="library">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="library">Skill Library</TabsTrigger>
          <TabsTrigger value="progress">Student Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          <SkillLibrary />
        </TabsContent>

        <TabsContent value="progress" className="mt-4 space-y-4">
          {students === undefined ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : activeStudents.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No active students"
              description="Create students to start tracking their skill progress."
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
                  description="Choose a student to edit their skill progress."
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
