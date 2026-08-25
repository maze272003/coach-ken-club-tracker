"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage, todayDateString } from "@/lib/format";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  status: z.enum(["present", "late", "absent"]),
});

/**
 * Record or update a single student's attendance for a date.
 */
export function AttendanceForm({ studentId }: { studentId: string }) {
  const [date, setDate] = useState(todayDateString());
  const [status, setStatus] = useState<"present" | "late" | "absent">("present");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const record = useMutation(api.attendance.record);

  async function handleSubmit(
    status: "present" | "late" | "absent",
  ) {
    if (saving) return;
    setError(null);
    const parsed = schema.safeParse({ date, status });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid attendance");
      return;
    }
    setSaving(true);
    try {
      await record({
        studentId: studentId as never,
        date: parsed.data.date,
        status: parsed.data.status,
      });
      toast.success("Attendance saved.");
      setStatus(status);
      setSaving(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save attendance. Please try again."),
      );
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Record Attendance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => e.preventDefault()} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="attendance-date">Date</Label>
            <Input
              id="attendance-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
              className="sm:w-44"
            />
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Attendance status"
          >
            <Button
              type="button"
              variant={status === "present" ? "default" : "outline"}
              disabled={saving}
              aria-pressed={status === "present"}
              onClick={() => void handleSubmit("present")}
            >
              Present
            </Button>
            <Button
              type="button"
              variant={status === "late" ? "default" : "outline"}
              disabled={saving}
              aria-pressed={status === "late"}
              onClick={() => void handleSubmit("late")}
            >
              Late
            </Button>
            <Button
              type="button"
              variant={status === "absent" ? "default" : "outline"}
              disabled={saving}
              aria-pressed={status === "absent"}
              onClick={() => void handleSubmit("absent")}
            >
              Absent
            </Button>
          </div>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
