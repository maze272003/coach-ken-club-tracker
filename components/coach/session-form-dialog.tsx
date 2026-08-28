"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Dumbbell } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSkillCatalog } from "@/lib/use-skill-catalog";
import { errorMessage, todayDateString } from "@/lib/format";

const sessionSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  title: z.string().trim().min(1, "Title is required").max(120),
  durationMinutes: z.coerce
    .number()
    .int("Duration must be a whole number")
    .positive("Duration must be positive")
    .max(1440, "Duration must be at most 1440 minutes"),
  distanceMeters: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 30000),
      "Distance must be between 1 and 30000 meters",
    ),
  strokes: z.array(z.string()).min(1, "Select at least one skill"),
  notes: z.string().trim().max(2000, "Notes must be at most 2000 characters"),
});

export type SessionFormValues = {
  studentId: string;
  date: string;
  title: string;
  durationMinutes: string;
  distanceMeters: string;
  intensity: string;
  strokes: string[];
  notes: string;
};

export function SessionFormDialog({
  fixedStudentId,
  sessionId,
  initial,
  trigger,
  triggerLabel,
}: {
  fixedStudentId?: string;
  sessionId?: string;
  initial?: Partial<SessionFormValues>;
  trigger?: React.ReactNode;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SessionFormValues>({
    studentId: fixedStudentId ?? initial?.studentId ?? "",
    date: initial?.date ?? todayDateString(),
    title: initial?.title ?? "",
    durationMinutes: initial?.durationMinutes ?? "60",
    distanceMeters: initial?.distanceMeters ?? "",
    intensity: initial?.intensity ?? "unset",
    strokes: initial?.strokes ?? [],
    notes: initial?.notes ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const students = useQuery(
    api.students.list,
    fixedStudentId !== undefined ? "skip" : {},
  );
  const { skills, active, isLoading: skillsLoading } = useSkillCatalog();
  const createSession = useMutation(api.training.create);
  const updateSession = useMutation(api.training.update);

  const editing = sessionId !== undefined;

  // Active skills are pickable; archived skills stay pickable only
  // when already selected (editing a historical session).
  const selectable = [
    ...active,
    ...skills.filter(
      (s) => s.status === "archived" && form.strokes.includes(s.key),
    ),
  ];

  function update<K extends keyof SessionFormValues>(
    key: K,
    value: SessionFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleStroke(stroke: string) {
    setForm((prev) => ({
      ...prev,
      strokes: prev.strokes.includes(stroke)
        ? prev.strokes.filter((s) => s !== stroke)
        : [...prev.strokes, stroke],
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsed = sessionSchema.safeParse(form);
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
      date: parsed.data.date,
      title: parsed.data.title,
      durationMinutes: parsed.data.durationMinutes,
      ...(parsed.data.distanceMeters !== ""
        ? { distanceMeters: Number(parsed.data.distanceMeters) }
        : {}),
      ...(form.intensity !== "unset"
        ? { intensity: form.intensity as "easy" | "moderate" | "hard" }
        : {}),
      strokes: parsed.data.strokes,
      notes: parsed.data.notes === "" ? undefined : parsed.data.notes,
    };
    try {
      if (editing) {
        await updateSession({ sessionId: sessionId as never, ...args });
        toast.success("Training session updated.");
      } else {
        await createSession(args);
        toast.success("Training session created.");
      }
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save the training session. Please try again."),
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
            <Dumbbell className="size-4 text-muted-foreground" aria-hidden="true" />
            {editing ? "Edit Training Session" : "New Training Session"}
          </DialogTitle>
          <DialogDescription>
            Record what the swimmer worked on and for how long.
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
              <Label htmlFor="session-student">Student</Label>
              <Select
                value={form.studentId}
                onValueChange={(value) => update("studentId", value)}
                disabled={submitting}
              >
                <SelectTrigger id="session-student" className="w-full">
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.date ? (
                <p className="text-xs text-destructive">{fieldErrors.date}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-duration">Duration (minutes)</Label>
              <Input
                id="session-duration"
                type="number"
                min={1}
                step={1}
                value={form.durationMinutes}
                onChange={(e) => update("durationMinutes", e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.durationMinutes ? (
                <p className="text-xs text-destructive">
                  {fieldErrors.durationMinutes}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-distance">Distance (m, optional)</Label>
              <Input
                id="session-distance"
                type="number"
                min={1}
                max={30000}
                value={form.distanceMeters}
                onChange={(e) => update("distanceMeters", e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.distanceMeters ? (
                <p className="text-xs text-destructive">
                  {fieldErrors.distanceMeters}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="session-intensity">Intensity (optional)</Label>
            <Select
              value={form.intensity}
              onValueChange={(value) => update("intensity", value)}
              disabled={submitting}
            >
              <SelectTrigger id="session-intensity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="session-title">Title</Label>
            <Input
              id="session-title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Technique Training"
              disabled={submitting}
            />
            {fieldErrors.title ? (
              <p className="text-xs text-destructive">{fieldErrors.title}</p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-2" disabled={submitting}>
            <legend className="text-sm font-medium">Skills</legend>
            {skillsLoading ? (
              <p className="text-xs text-muted-foreground">Loading skills…</p>
            ) : selectable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No skills available yet — add skills on the Skills page.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {selectable.map((skill) => (
                  <label
                    key={skill.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[button[data-state=checked]]:border-primary"
                  >
                    <Checkbox
                      checked={form.strokes.includes(skill.key)}
                      onCheckedChange={() => toggleStroke(skill.key)}
                    />
                    {skill.name}
                  </label>
                ))}
              </div>
            )}
            {fieldErrors.strokes ? (
              <p className="text-xs text-destructive">{fieldErrors.strokes}</p>
            ) : null}
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="session-notes">Notes (optional)</Label>
            <Textarea
              id="session-notes"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Focus areas, feedback, observations…"
              rows={3}
              disabled={submitting}
            />
            {fieldErrors.notes ? (
              <p className="text-xs text-destructive">{fieldErrors.notes}</p>
            ) : null}
          </div>
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
              {submitting
                ? "Saving…"
                : editing
                  ? "Save Changes"
                  : "Create Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
