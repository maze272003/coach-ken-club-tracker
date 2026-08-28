"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Plus, Sparkles, Timer } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  errorMessage,
  parseTimeToMs,
  todayDateString,
} from "@/lib/format";
import { VALID_DISTANCES, type ValidStroke } from "@/convex/lib/validation";

const strokeOptions = [
  { value: "freestyle", label: "Freestyle" },
  { value: "backstroke", label: "Backstroke" },
  { value: "breaststroke", label: "Breaststroke" },
  { value: "butterfly", label: "Butterfly" },
  { value: "im", label: "Individual Medley (IM)" },
] as const;

export function LogTimeDialog({
  studentId,
  studentName,
  trigger,
}: {
  studentId: Id<"students">;
  studentName: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayDateString());
  const [stroke, setStroke] = useState<ValidStroke>("freestyle");
  const [distanceMeters, setDistanceMeters] = useState<number>(50);
  const [course, setCourse] = useState<"short" | "long">("short");
  const [timeInput, setTimeInput] = useState("");
  const [context, setContext] = useState<"practice" | "time_trial" | "meet">("time_trial");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createTime = useMutation(api.times.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeInput.trim()) {
      toast.error("Please enter a swim time");
      return;
    }

    const timeMs = parseTimeToMs(timeInput);
    if (timeMs === null) {
      toast.error("Invalid time format. Enter e.g. 28.45 or 1:04.25");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createTime({
        studentId,
        date,
        stroke,
        distanceMeters,
        course,
        timeMs,
        context,
        notes: notes.trim() || undefined,
      });

      if (res.isNewPersonalBest) {
        if (res.deltaMs !== null) {
          toast.success(
            `🎉 New Personal Best! Dropped ${(res.deltaMs / 1000).toFixed(2)}s (-${res.deltaPct}%)!`,
          );
        } else {
          toast.success(`🎉 First Personal Best recorded!`);
        }
      } else {
        toast.success("Swim time recorded successfully.");
      }

      setTimeInput("");
      setNotes("");
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to log swim time"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Log Time
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="size-5 text-amber-500" />
              Log Swim Time
            </DialogTitle>
            <DialogDescription>
              Record a single time result for {studentName}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Stroke</Label>
              <Select value={stroke} onValueChange={(v) => setStroke(v as ValidStroke)}>
                <SelectTrigger>
                  <SelectValue placeholder="Stroke" />
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

            <div className="space-y-1.5">
              <Label>Distance</Label>
              <Select
                value={String(distanceMeters)}
                onValueChange={(val) => setDistanceMeters(parseInt(val, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Distance" />
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

            <div className="space-y-1.5">
              <Label>Pool Course</Label>
              <Select value={course} onValueChange={(v) => setCourse(v as "short" | "long")}>
                <SelectTrigger>
                  <SelectValue placeholder="Course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short Course (25m SCM)</SelectItem>
                  <SelectItem value="long">Long Course (50m LCM)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Context</Label>
              <Select value={context} onValueChange={(v) => setContext(v as "practice" | "time_trial" | "meet")}>
                <SelectTrigger>
                  <SelectValue placeholder="Context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time_trial">Time Trial</SelectItem>
                  <SelectItem value="practice">Practice</SelectItem>
                  <SelectItem value="meet">Swim Meet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Time (e.g. 28.45 or 1:04.25)</Label>
              <Input
                placeholder="28.45"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="font-mono text-base"
                required
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Race split details, underwater tempo, or coach feedback..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              <Sparkles className="size-4" />
              {submitting ? "Saving..." : "Save Time"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
