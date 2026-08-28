"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ClipboardCheck, Target, Timer, Trash2 } from "lucide-react";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage, parseTimeToMs } from "@/lib/format";
import { VALID_DISTANCES, type ValidStroke } from "@/convex/lib/validation";


const goalSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(2000, "Description is too long"),
  type: z.enum(["manual", "time", "attendance"]),
  stroke: z.string().optional(),
  distanceMeters: z.number().optional(),
  course: z.enum(["short", "long"]).optional(),
  targetTimeInput: z.string().optional(),
  baselineBestInput: z.string().optional(),
  targetAttendancePct: z.number().min(1).max(100).optional(),
  target: z.string().trim().max(300, "Target is too long"),
  progress: z.coerce
    .number()
    .int("Progress must be a whole number")
    .min(0, "Progress must be between 0 and 100")
    .max(100, "Progress must be between 0 and 100"),
  status: z.enum(["not_started", "in_progress", "completed", "archived"]),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")
    .or(z.literal("")),
});

const statusOptions = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

const strokeOptions = [
  { value: "freestyle", label: "Freestyle" },
  { value: "backstroke", label: "Backstroke" },
  { value: "breaststroke", label: "Breaststroke" },
  { value: "butterfly", label: "Butterfly" },
  { value: "im", label: "Individual Medley (IM)" },
] as const;

export type GoalFormValues = {
  studentId: string;
  title: string;
  description: string;
  type: "manual" | "time" | "attendance";
  stroke?: string;
  distanceMeters?: number;
  course?: "short" | "long";
  targetTimeInput?: string;
  baselineBestInput?: string;
  targetAttendancePct?: number;
  target: string;
  progress: string;
  status: "not_started" | "in_progress" | "completed" | "archived";
  targetDate: string;
};

export function GoalFormDialog({
  fixedStudentId,
  goalId,
  initial,
  trigger,
  triggerLabel,
}: {
  fixedStudentId?: string;
  goalId?: string;
  initial?: Partial<GoalFormValues>;
  trigger?: React.ReactNode;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<GoalFormValues>({
    studentId: fixedStudentId ?? initial?.studentId ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    type: initial?.type ?? "time",
    stroke: initial?.stroke ?? "freestyle",
    distanceMeters: initial?.distanceMeters ?? 50,
    course: initial?.course ?? "short",
    targetTimeInput: initial?.targetTimeInput ?? "",
    baselineBestInput: initial?.baselineBestInput ?? "",
    targetAttendancePct: initial?.targetAttendancePct ?? 90,
    target: initial?.target ?? "",
    progress: initial?.progress ?? "0",
    status: initial?.status ?? "in_progress",
    targetDate: initial?.targetDate ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const students = useQuery(
    api.students.list,
    fixedStudentId !== undefined ? "skip" : {},
  );
  const createGoal = useMutation(api.goals.create);
  const updateGoal = useMutation(api.goals.update);
  const removeGoal = useMutation(api.goals.remove);

  const editing = goalId !== undefined;

  function update<K extends keyof GoalFormValues>(
    key: K,
    value: GoalFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const parsed = goalSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    let targetTimeMs: number | undefined = undefined;
    let baselineBestMs: number | undefined = undefined;

    if (form.type === "time") {
      if (!form.targetTimeInput?.trim()) {
        setFieldErrors({ targetTimeInput: "Target time is required (e.g. 29.50)" });
        return;
      }
      const parsedTargetMs = parseTimeToMs(form.targetTimeInput);
      if (parsedTargetMs === null) {
        setFieldErrors({ targetTimeInput: "Invalid time format (e.g. 28.45 or 1:04.25)" });
        return;
      }
      targetTimeMs = parsedTargetMs;

      if (form.baselineBestInput?.trim()) {
        const parsedBaselineMs = parseTimeToMs(form.baselineBestInput);
        if (parsedBaselineMs === null) {
          setFieldErrors({ baselineBestInput: "Invalid baseline time format" });
          return;
        }
        baselineBestMs = parsedBaselineMs;
      }
    }

    setFieldErrors({});
    setSubmitting(true);

    const args = {
      studentId: parsed.data.studentId as Id<"students">,
      title: parsed.data.title,
      description: parsed.data.description === "" ? undefined : parsed.data.description,
      type: parsed.data.type,
      distanceMeters: parsed.data.type === "time" ? form.distanceMeters : undefined,
      stroke: parsed.data.type === "time" ? form.stroke : undefined,
      course: parsed.data.type === "time" ? form.course : undefined,
      targetTimeMs,
      baselineBestMs,
      targetAttendancePct:
        parsed.data.type === "attendance" ? form.targetAttendancePct : undefined,
      target: parsed.data.target === "" ? undefined : parsed.data.target,
      progress: parsed.data.type === "manual" ? parsed.data.progress : 0,
      status: parsed.data.status,
      targetDate: parsed.data.targetDate === "" ? undefined : parsed.data.targetDate,
    };

    try {
      if (editing) {
        await updateGoal({ goalId: goalId as Id<"trainingGoals">, ...args });
        toast.success("Training goal updated.");
      } else {
        await createGoal(args);
        toast.success("Training goal created.");
      }
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save the training goal. Please try again."),
      );
      setSubmitting(false);
    }
  }

  const handleDelete = async () => {
    if (!goalId) return;
    try {
      await removeGoal({ goalId: goalId as Id<"trainingGoals"> });
      toast.success("Goal deleted.");
      setDeleteOpen(false);
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete goal"));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger ?? <Button variant={editing ? "outline" : "default"}>{triggerLabel}</Button>}
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="size-5 text-primary" aria-hidden="true" />
              {editing ? "Edit Training Goal" : "New Training Goal"}
            </DialogTitle>
            <DialogDescription>
              Set auto-calculating time targets, attendance streaks, or custom milestones.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {fixedStudentId === undefined ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-student">Swimmer</Label>
                <Select
                  value={form.studentId}
                  onValueChange={(value) => update("studentId", value)}
                  disabled={submitting}
                >
                  <SelectTrigger id="goal-student" className="w-full">
                    <SelectValue placeholder="Select a swimmer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(students ?? [])
                      .filter((s) => s.status === "active" || s.studentId === form.studentId)
                      .map((s) => (
                        <SelectItem key={s.studentId} value={s.studentId}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {fieldErrors.studentId ? (
                  <p className="text-xs text-destructive">{fieldErrors.studentId}</p>
                ) : null}
              </div>
            ) : null}

            {/* Goal Type Selector */}
            <div className="flex flex-col gap-1.5">
              <Label>Goal Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={form.type === "time" ? "default" : "outline"}
                  onClick={() => update("type", "time")}
                  className="gap-1.5 text-xs h-9"
                >
                  <Timer className="size-3.5" />
                  Time Target
                </Button>
                <Button
                  type="button"
                  variant={form.type === "attendance" ? "default" : "outline"}
                  onClick={() => update("type", "attendance")}
                  className="gap-1.5 text-xs h-9"
                >
                  <ClipboardCheck className="size-3.5" />
                  Attendance %
                </Button>
                <Button
                  type="button"
                  variant={form.type === "manual" ? "default" : "outline"}
                  onClick={() => update("type", "manual")}
                  className="gap-1.5 text-xs h-9"
                >
                  <Target className="size-3.5" />
                  Custom Goal
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-title">Goal Title</Label>
              <Input
                id="goal-title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={
                  form.type === "time"
                    ? "e.g. Break 30.00s in 50m Free"
                    : form.type === "attendance"
                      ? "e.g. 90% Practice Consistency"
                      : "e.g. Master Flip Turns"
                }
                disabled={submitting}
              />
              {fieldErrors.title ? (
                <p className="text-xs text-destructive">{fieldErrors.title}</p>
              ) : null}
            </div>

            {/* TIME GOAL SPECIFIC FIELDS */}
            {form.type === "time" && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Stroke</Label>
                    <Select
                      value={form.stroke}
                      onValueChange={(v) => update("stroke", v as ValidStroke)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {strokeOptions.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Distance</Label>
                    <Select
                      value={String(form.distanceMeters)}
                      onValueChange={(val) => update("distanceMeters", parseInt(val, 10))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VALID_DISTANCES.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d}m
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Course</Label>
                    <Select
                      value={form.course}
                      onValueChange={(v) => update("course", v as "short" | "long")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">SCM (25m)</SelectItem>
                        <SelectItem value="long">LCM (50m)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground">
                      Target Time (e.g. 29.50)
                    </Label>
                    <Input
                      placeholder="29.50"
                      value={form.targetTimeInput}
                      onChange={(e) => update("targetTimeInput", e.target.value)}
                      className="font-mono text-xs h-8"
                    />
                    {fieldErrors.targetTimeInput && (
                      <p className="text-[11px] text-destructive">{fieldErrors.targetTimeInput}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Baseline PB (Optional)
                    </Label>
                    <Input
                      placeholder="Auto-captured from records"
                      value={form.baselineBestInput}
                      onChange={(e) => update("baselineBestInput", e.target.value)}
                      className="font-mono text-xs h-8"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Progress calculates dynamically against fastest logged time and auto-completes when achieved.
                </p>
              </div>
            )}

            {/* ATTENDANCE GOAL SPECIFIC FIELDS */}
            {form.type === "attendance" && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Label className="text-xs font-semibold">Target Attendance Consistency (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.targetAttendancePct}
                  onChange={(e) => update("targetAttendancePct", parseInt(e.target.value, 10))}
                  placeholder="90"
                  className="font-mono text-xs h-8"
                />
                <p className="text-[11px] text-muted-foreground">
                  Evaluates against actual session attendance since athlete joined.
                </p>
              </div>
            )}

            {/* MANUAL GOAL SPECIFIC FIELDS */}
            {form.type === "manual" && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-target">Target Milestone (Optional)</Label>
                  <Input
                    id="goal-target"
                    value={form.target}
                    onChange={(e) => update("target", e.target.value)}
                    placeholder="e.g. Complete 5 dolphin kicks off every turn"
                    disabled={submitting}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-progress">Progress ({form.progress}%)</Label>
                  <Input
                    id="goal-progress"
                    type="number"
                    min={0}
                    max={100}
                    value={form.progress}
                    onChange={(e) => update("progress", e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    update("status", value as GoalFormValues["status"])
                  }
                  disabled={submitting}
                >
                  <SelectTrigger id="goal-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-target-date">Target Date (Optional)</Label>
                <Input
                  id="goal-target-date"
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => update("targetDate", e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between pt-2">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : editing ? "Save Changes" : "Create Goal"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Goal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this goal? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
