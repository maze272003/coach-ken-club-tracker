"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, todayDateString } from "@/lib/format";

const statusButtons = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
] as const;

type StatusValue = (typeof statusButtons)[number]["value"];

const buttonStyles: Record<StatusValue, string> = {
  present:
    "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600",
  late: "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-400 dark:hover:bg-amber-500",
  absent:
    "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600",
};

export default function CoachAttendancePage() {
  const [date, setDate] = useState(todayDateString());
  const rollCall = useQuery(api.attendance.rollCall, { date });
  const record = useMutation(api.attendance.record);
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setAttendance(
    studentId: string,
    studentName: string,
    status: StatusValue,
  ) {
    if (savingFor !== null) return;
    setError(null);
    setSavingFor(studentId);
    try {
      await record({ studentId: studentId as never, date, status });
      toast.success(`${studentName} marked ${status}.`);
      setSavingFor(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to save attendance. Please try again."));
      setSavingFor(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Record daily roll call for your active swimmers."
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label htmlFor="rollcall-date">Date</Label>
            <Input
              id="rollcall-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {rollCall === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : rollCall.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No active students"
              description="Create students to start recording attendance."
            />
          ) : (
            <ul className="divide-y">
              {rollCall.map((row) => (
                <li
                  key={row.studentId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <StudentAvatar name={row.name} className="size-9" />
                    <span className="font-medium">{row.name}</span>
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label={`Attendance for ${row.name}`}
                  >
                    {statusButtons.map((button) => {
                      const active = row.status === button.value;
                      return (
                        <Button
                          key={button.value}
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className={
                            active ? buttonStyles[button.value] : undefined
                          }
                          disabled={savingFor !== null}
                          aria-pressed={active}
                          onClick={() =>
                            void setAttendance(
                              row.studentId,
                              row.name,
                              button.value,
                            )
                          }
                        >
                          {button.label}
                        </Button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
