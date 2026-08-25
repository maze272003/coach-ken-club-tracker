"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { STROKES, errorMessage } from "@/lib/format";

type ProgressMap = Record<string, number>;

function initialMap(skills: { stroke: string; progress: number }[]): ProgressMap {
  const map: ProgressMap = {};
  for (const skill of skills) {
    map[skill.stroke] = skill.progress;
  }
  for (const stroke of STROKES) {
    if (map[stroke.key] === undefined) map[stroke.key] = 0;
  }
  return map;
}

/**
 * Coach-only editor for a student's stroke skill progress.
 * Saves all strokes in one submit. The draft starts from the server
 * values and is held locally until saved.
 */
export function SkillsEditor({ studentId }: { studentId: string }) {
  const skills = useQuery(api.skills.listForStudent, {
    studentId: studentId as never,
  });
  const setProgress = useMutation(api.skills.setProgress);

  const [draft, setDraft] = useState<ProgressMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const values: ProgressMap =
    draft ??
    (skills === undefined ? Object.fromEntries(STROKES.map((s) => [s.key, 0])) : initialMap(skills));

  const dirty =
    skills !== undefined &&
    draft !== null &&
    (skills.length !== Object.keys(draft).length ||
      skills.some(
        (s) => draft[s.stroke] !== undefined && draft[s.stroke] !== s.progress,
      ));

  function setStroke(stroke: string, value: string) {
    const clamped = value === "" ? 0 : Math.min(100, Math.max(0, Number(value)));
    if (Number.isNaN(clamped)) return;
    setDraft((prev) => ({
      ...(prev ?? values),
      [stroke]: Math.round(clamped),
    }));
  }

  async function handleSave() {
    if (saving || !dirty || draft === null) return;
    setError(null);
    setSaving(true);
    try {
      for (const [stroke, progress] of Object.entries(draft)) {
        await setProgress({
          studentId: studentId as never,
          stroke,
          progress,
        });
      }
      toast.success("Stroke skills updated.");
      setSaving(false);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save skill progress. Please try again."),
      );
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
          Stroke Skills
        </CardTitle>
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {skills === undefined ? (
          <div className="space-y-4">
            {STROKES.map((stroke) => (
              <div key={stroke.key} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : skills.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No skill records yet"
            description="Stroke skills are created when a student account is created."
            className="border-0 py-4"
          />
        ) : (
          STROKES.map((stroke) => {
            const value = values[stroke.key] ?? 0;
            return (
              <div key={stroke.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{stroke.label}</span>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={value}
                      className="hidden w-40 sm:block"
                      aria-hidden="true"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={value}
                      onChange={(e) => setStroke(stroke.key, e.target.value)}
                      className="h-8 w-20 text-right tabular-nums"
                      aria-label={`${stroke.label} progress (0 to 100 percent)`}
                      disabled={saving}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
