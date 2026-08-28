"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CalendarClock, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PracticeFormDialog } from "@/components/coach/practice-form-dialog";
import { CompletePracticeDialog } from "@/components/coach/complete-practice-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, formatDate, todayDateString } from "@/lib/format";

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const statusBadge: Record<string, string> = {
  planned: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400",
  completed:
    "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cancelled:
    "bg-rose-600/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

export default function CoachPracticesPage() {
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
  const [groupFilter, setGroupFilter] = useState<string>("first");
  const effectiveGroup =
    groupFilter !== "first" && groupFilter !== ""
      ? groupFilter
      : (activeGroups[0]?.groupId ?? "");
  const practices = useQuery(
    api.practices.listForGroup,
    effectiveGroup
      ? {
          groupId: effectiveGroup as never,
          fromDate: dateOffset(-30),
          toDate: dateOffset(60),
        }
      : "skip",
  );
  const cancel = useMutation(api.practices.cancel);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancelPractice(practiceId: string, title: string) {
    if (busyId !== null) return;
    setError(null);
    setBusyId(practiceId);
    try {
      await cancel({ practiceId: practiceId as never });
      toast.success(`"${title}" cancelled.`);
      setBusyId(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to cancel. Please try again."));
      setBusyId(null);
    }
  }

  const today = todayDateString();
  const upcoming = (practices ?? []).filter(
    (p) => p.date >= today && p.status === "planned",
  );
  const past = (practices ?? []).filter(
    (p) => p.date < today || p.status !== "planned",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practices"
        description="Plan group workouts and log them as completed sessions in one click."
        actions={<PracticeFormDialog mode="create" groupId={effectiveGroup} />}
      />

      <Select
        value={effectiveGroup}
        onValueChange={setGroupFilter}
        disabled={groups === undefined}
      >
        <SelectTrigger className="w-full max-w-56" aria-label="Filter by group">
          <SelectValue
            placeholder={
              groups !== undefined && activeGroups.length === 0
                ? "No groups yet"
                : undefined
            }
          />
        </SelectTrigger>
        <SelectContent>
          {activeGroups.map((group) => (
            <SelectItem key={group.groupId} value={group.groupId}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {groups !== undefined && activeGroups.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No training groups"
          description="Create a group first, then schedule practices for it."
        />
      ) : practices === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled for this group in the next 60 days.
                </p>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((practice) => (
                    <li
                      key={practice._id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{practice.title}</span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-medium",
                              statusBadge[practice.status],
                            )}
                          >
                            {practice.plannedDurationMinutes} min
                            {practice.plannedDistanceMeters !== null
                              ? ` · ${practice.plannedDistanceMeters.toLocaleString()} m`
                              : ""}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(practice.date)}
                          {practice.startTime ? ` at ${practice.startTime}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CompletePracticeDialog practice={practice} />
                        <PracticeFormDialog
                          mode="edit"
                          groupId={practice.groupId}
                          practice={practice}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId !== null}
                          onClick={() =>
                            void cancelPractice(practice._id, practice.title)
                          }
                        >
                          <XCircle className="size-4" aria-hidden="true" />
                          Cancel
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Past 30 days
              </h2>
              {past.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed or cancelled practices yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {past.map((practice) => (
                    <li
                      key={practice._id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{practice.title}</span>
                          <Badge
                            variant="secondary"
                            className={cn(statusBadge[practice.status])}
                          >
                            {practice.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(practice.date)}
                          {practice.status === "completed"
                            ? ` — ${practice.actualDurationMinutes ?? "?"} min${
                                practice.actualDistanceMeters !== null
                                  ? ` · ${practice.actualDistanceMeters.toLocaleString()} m`
                                  : ""
                              }`
                            : ""}
                        </p>
                      </div>
                      {practice.status === "planned" ? (
                        <CompletePracticeDialog practice={practice} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
