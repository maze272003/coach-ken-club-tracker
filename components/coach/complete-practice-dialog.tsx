"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage, formatDate } from "@/lib/format";

export function CompletePracticeDialog({
  practice,
  triggerLabel = "Mark Completed",
}: {
  practice: {
    _id: string;
    title: string;
    groupName: string;
    date: string;
    plannedDurationMinutes: number;
    plannedDistanceMeters: number | null;
  };
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(
    String(practice.plannedDurationMinutes),
  );
  const [distance, setDistance] = useState(
    practice.plannedDistanceMeters?.toString() ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const complete = useMutation(api.practices.complete);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsedDuration = Number(duration);
    if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) {
      setError("Actual duration must be a positive number of minutes.");
      return;
    }
    const trimmed = distance.trim();
    if (trimmed !== "" && !Number.isInteger(Number(trimmed))) {
      setError("Actual distance must be a whole number of meters.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await complete({
        practiceId: practice._id as never,
        actualDurationMinutes: parsedDuration,
        ...(trimmed !== "" ? { actualDistanceMeters: Number(trimmed) } : {}),
      });
      toast.success(
        `Practice completed — ${result.sessionsCreated} sessions logged, ` +
          `${result.sessionsUpdated} updated, ${result.sessionsSkipped} skipped (absent).`,
      );
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to complete the practice. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Practice</DialogTitle>
          <DialogDescription>
            {practice.title} — {practice.groupName}, {formatDate(practice.date)}.
            A training session is logged for every swimmer who attended
            (swimmers marked absent are skipped).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="actual-duration">Actual duration (min)</Label>
              <Input
                id="actual-duration"
                type="number"
                min={1}
                max={600}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="actual-distance">Actual distance (m)</Label>
              <Input
                id="actual-distance"
                type="number"
                min={1}
                max={30000}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                disabled={submitting}
              />
            </div>
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
              {submitting ? "Completing…" : "Complete & Log Sessions"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
