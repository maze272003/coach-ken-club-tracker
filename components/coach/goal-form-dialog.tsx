"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/lib/format";

const goalSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(2000, "Description is too long"),
  target: z.string().trim().max(300, "Target is too long"),
  progress: z.coerce
    .number()
    .int("Progress must be a whole number")
    .min(0, "Progress must be between 0 and 100")
    .max(100, "Progress must be between 0 and 100"),
  status: z.enum(["not_started", "in_progress", "completed"]),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")
    .or(z.literal("")),
});

const statusOptions = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
] as const;

export type GoalFormValues = {
  studentId: string;
  title: string;
  description: string;
  target: string;
  progress: string;
  status: "not_started" | "in_progress" | "completed";
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
  const [form, setForm] = useState<GoalFormValues>({
    studentId: fixedStudentId ?? initial?.studentId ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
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
    setFieldErrors({});
    setSubmitting(true);
    const args = {
      studentId: parsed.data.studentId as never,
      title: parsed.data.title,
      description: parsed.data.description === "" ? undefined : parsed.data.description,
      target: parsed.data.target === "" ? undefined : parsed.data.target,
      progress: parsed.data.progress,
      status: parsed.data.status,
      targetDate: parsed.data.targetDate === "" ? undefined : parsed.data.targetDate,
    };
    try {
      if (editing) {
        await updateGoal({ goalId: goalId as never, ...args });
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant={editing ? "outline" : "default"}>{triggerLabel}</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-4 text-muted-foreground" aria-hidden="true" />
            {editing ? "Edit Training Goal" : "New Training Goal"}
          </DialogTitle>
          <DialogDescription>
            Set a target for the swimmer to work towards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {fixedStudentId === undefined ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-student">Student</Label>
              <Select
                value={form.studentId}
                onValueChange={(value) => update("studentId", value)}
                disabled={submitting}
              >
                <SelectTrigger id="goal-student" className="w-full">
                  <SelectValue placeholder="Select a student" />
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Improve 100m Freestyle"
              disabled={submitting}
            />
            {fieldErrors.title ? (
              <p className="text-xs text-destructive">{fieldErrors.title}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-description">Description (optional)</Label>
            <Textarea
              id="goal-description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What does achieving this goal involve?"
              rows={2}
              disabled={submitting}
            />
            {fieldErrors.description ? (
              <p className="text-xs text-destructive">{fieldErrors.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-target">Target (optional)</Label>
            <Input
              id="goal-target"
              value={form.target}
              onChange={(e) => update("target", e.target.value)}
              placeholder="e.g. Complete 100m freestyle under 2:00"
              disabled={submitting}
            />
            {fieldErrors.target ? (
              <p className="text-xs text-destructive">{fieldErrors.target}</p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-progress">Progress (%)</Label>
              <Input
                id="goal-progress"
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.progress}
                onChange={(e) => update("progress", e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.progress ? (
                <p className="text-xs text-destructive">{fieldErrors.progress}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-target-date">Target date</Label>
              <Input
                id="goal-target-date"
                type="date"
                value={form.targetDate}
                onChange={(e) => update("targetDate", e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.targetDate ? (
                <p className="text-xs text-destructive">{fieldErrors.targetDate}</p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A goal that reaches 100% progress is automatically marked as
            completed.
          </p>
          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
