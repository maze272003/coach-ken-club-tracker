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
import { useSkillCatalog } from "@/lib/use-skill-catalog";
import { errorMessage } from "@/lib/format";

type ProgressMap = Record<string, number>;

/**
 * Coach-only editor for a student's skill progress. Rows come from
 * the active skill catalog; skills without a record yet default to 0
 * and are created on save. Only changed values are written.
 */
export function SkillsEditor({ studentId }: { studentId: string }) {
  const { active, isLoading: catalogLoading } = useSkillCatalog();
  const skills = useQuery(api.skills.listForStudent, {
    studentId: studentId as never,
  });
  const setProgress = useMutation(api.skills.setProgress);

  const [draft, setDraft] = useState<ProgressMap | null>(null);
  const [saving, setSaving] = useState(false);

  const serverValues: ProgressMap = {};
  for (const skill of skills ?? []) {
    serverValues[skill.key] = skill.progress;
  }

  const values: ProgressMap = draft ?? serverValues;

  const dirty =
    draft !== null &&
    active.some(
      (skill) => (draft[skill.key] ?? 0) !== (serverValues[skill.key] ?? 0),
    );

  function setSkill(key: string, value: string) {
    const clamped = value === "" ? 0 : Math.min(100, Math.max(0, Number(value)));
    if (Number.isNaN(clamped)) return;
    setDraft((prev) => ({
      ...(prev ?? values),
      [key]: Math.round(clamped),
    }));
  }

  async function handleSave() {
    if (saving || !dirty || draft === null) return;
    setSaving(true);
    try {
      const changed = active.filter(
        (skill) =>
          (draft[skill.key] ?? 0) !== (serverValues[skill.key] ?? 0) &&
          (serverValues[skill.key] !== undefined || (draft[skill.key] ?? 0) > 0),
      );
      for (const skill of changed) {
        await setProgress({
          studentId: studentId as never,
          key: skill.key,
          progress: draft[skill.key] ?? 0,
        });
      }
      toast.success("Skill progress updated.");
      setDraft(null);
      setSaving(false);
    } catch (err) {
      toast.error(
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
          Skill Progress
        </CardTitle>
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {catalogLoading || skills === undefined ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : active.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No skills yet"
            description="Add skill programs in the Skill Library to start tracking progress."
            className="border-0 py-4"
          />
        ) : (
          active.map((skill) => {
            const value = values[skill.key] ?? 0;
            return (
              <div key={skill.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{skill.name}</span>
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
                      onChange={(e) => setSkill(skill.key, e.target.value)}
                      className="h-8 w-20 text-right tabular-nums"
                      aria-label={`${skill.name} progress (0 to 100 percent)`}
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
