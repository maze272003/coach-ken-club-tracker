"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronRight, Search, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CreateStudentDialog } from "@/components/students/create-student-dialog";
import { Card, CardContent } from "@/components/ui/card";
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

export default function CoachStudentsPage() {
  const [search, setSearch] = useState("");
  const students = useQuery(api.students.list, { search });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Manage swimmer accounts and review their progress."
        actions={<CreateStudentDialog />}
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="relative w-full max-w-xs">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search by name or email…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </div>

          {students === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
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
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Attendance</TableHead>
                    <TableHead className="hidden md:table-cell">Progress</TableHead>
                    <TableHead className="hidden lg:table-cell">Current goal</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell>
                        <Link
                          href={`/coach/students/${student.studentId}`}
                          className="flex items-center gap-3 font-medium hover:underline"
                        >
                          <StudentAvatar
                            name={student.name}
                            image={student.image}
                            className="size-8"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{student.name}</span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">
                              {student.email}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            student.status === "active" ? "default" : "secondary"
                          }
                        >
                          {student.status === "active" ? "Active" : "Inactive"}
                        </Badge>
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
                        <ChevronRight
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
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
