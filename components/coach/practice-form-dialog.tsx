"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { errorMessage } from "@/lib/format";

type PracticeInput = {
  _id: string;
  date: string;
  startTime: string | null;
  title: string;
  plannedDurationMinutes: number;
  plannedDistanceMeters: number | null;
  strokes: string[];
  notes: string | null;
};

type Initial = {
  date: string;
  startTime: string;
  title: string;
  plannedDurationMinutes: string;
  plannedDistanceMeters: string;
  strokes: string[];
  notes: string;
};

function initialFor(
  groupId: string,
  practice?: {
    date: string;
    startTime: string | null;
    title: string;
    plannedDurationMinutes: number;
    plannedDistanceMeters: number | null;
    strokes: string[];
    notes: string | null;
  },
): Initial {
  return {
    date: practice?.date ?? "",
    startTime: practice?.startTime ?? "",
    title: practice?.title ?? "",
    plannedDurationMinutes: practice
      ? String(practice.plannedDurationMinutes)
      : "",
    plannedDistanceMeters: practice
      ? (practice.plannedDistanceMeters?.toString() ?? "")
      : "",
    strokes: practice?.strokes ?? [],
    notes: practice?.notes ?? "",
  };
}

export function PracticeFormDialog({
  mode,
  groupId,
  practice,
}: {
  mode: "create" | "edit";
  groupId: string;
  practice?: PracticeInput;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button disabled={!groupId}>
            <Plus className="size-4" aria-hidden="true" />
            Schedule Practice
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted fresh on every open, so the form state resets
            from the latest practice props each time. */}
        <PracticeForm
          mode={mode}
          groupId={groupId}
          practice={practice}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PracticeForm({
  mode,
  groupId,
  practice,
  onClose,
}: {
  mode: "create" | "edit";
  groupId: string;
  practice?: PracticeInput;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Initial>(() => initialFor(groupId, practice));
  const [submitting, setSubmitting] = useState(false);
  const create = useMutation(api.practices.create);
  const update = useMutation(api.practices.update);
  const catalog = useQuery(api.skills.catalog, {});
  const activeSkills = (catalog ?? []).filter((s) => s.status === "active");

  function toggleStroke(key: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      strokes: checked
        ? [...prev.strokes, key]
        : prev.strokes.filter((s) => s !== key),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const title = form.title.trim();
    const duration = Number(form.plannedDurationMinutes);
    const distance = form.plannedDistanceMeters.trim();
    if (title.length === 0) {
      toast.warning("Title is required.");
      return;
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      toast.warning("Planned duration must be a positive number of minutes.");
      return;
    }
    if (distance !== "" && !Number.isInteger(Number(distance))) {
      toast.warning("Planned distance must be a whole number of meters.");
      return;
    }
    if (form.strokes.length === 0) {
      toast.warning("Select at least one skill.");
      return;
    }

    setSubmitting(true);
    try {
      const args = {
        groupId: groupId as never,
        date: form.date,
        ...(form.startTime ? { startTime: form.startTime } : {}),
        title,
        plannedDurationMinutes: duration,
        ...(distance !== "" ? { plannedDistanceMeters: Number(distance) } : {}),
        strokes: form.strokes,
        ...(form.notes.trim() ? { notes: form.notes } : {}),
      };
      if (mode === "create") {
        await create(args);
        toast.success("Practice scheduled.");
      } else {
        await update({ ...args, practiceId: practice!._id as never });
        toast.success("Practice updated.");
      }
      onClose();
      setSubmitting(false);
    } catch (err) {
      toast.error(
        errorMessage(err, "Unable to save the practice. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "create" ? "Schedule Practice" : "Edit Practice"}
        </DialogTitle>
        <DialogDescription>
          Plan a workout for the group. Completing it later logs a session
          for every swimmer who attended.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-date">Date</Label>
              <Input
                id="practice-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-time">Start time (optional)</Label>
              <Input
                id="practice-time"
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((p) => ({ ...p, startTime: e.target.value }))
                }
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="practice-title">Title</Label>
            <Input
              id="practice-title"
              placeholder="Aerobic base"
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-duration">Duration (min)</Label>
              <Input
                id="practice-duration"
                type="number"
                min={1}
                max={600}
                required
                value={form.plannedDurationMinutes}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    plannedDurationMinutes: e.target.value,
                  }))
                }
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="practice-distance">Planned distance (m)</Label>
              <Input
                id="practice-distance"
                type="number"
                min={1}
                max={30000}
                placeholder="3000"
                value={form.plannedDistanceMeters}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    plannedDistanceMeters: e.target.value,
                  }))
                }
                disabled={submitting}
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Focus skills</legend>
            <div className="flex flex-wrap gap-3">
              {activeSkills.map((skill) => (
                <label
                  key={skill.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.strokes.includes(skill.key)}
                    onCheckedChange={(checked) =>
                      toggleStroke(skill.key, checked === true)
                    }
                    disabled={submitting}
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="practice-notes">Workout notes</Label>
            <Textarea
              id="practice-notes"
              placeholder="4x200 free on 3:00, 8x50 kick…"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : mode === "create"
                  ? "Schedule"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}
