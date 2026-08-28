"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Award,
  Calendar,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EmptyState } from "@/components/shared/empty-state";
import { LogTimeDialog } from "@/components/coach/log-time-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, formatDate } from "@/lib/format";
import type { ValidStroke } from "@/convex/lib/validation";

const strokeOptions = [
  { value: "freestyle", label: "Freestyle" },
  { value: "backstroke", label: "Backstroke" },
  { value: "breaststroke", label: "Breaststroke" },
  { value: "butterfly", label: "Butterfly" },
  { value: "im", label: "Individual Medley (IM)" },
] as const;

export function StudentTimesTab({
  studentId,
  studentName,
}: {
  studentId: Id<"students">;
  studentName: string;
}) {
  const [filterStroke, setFilterStroke] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterContext, setFilterContext] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<Id<"timeResults"> | null>(null);

  const pbs = useQuery(api.times.getPersonalBests, { studentId });
  const times = useQuery(api.times.listForStudent, {
    studentId,
    stroke: filterStroke === "all" ? undefined : (filterStroke as ValidStroke),
    course: filterCourse === "all" ? undefined : (filterCourse as "short" | "long"),
    context: filterContext === "all" ? undefined : (filterContext as "practice" | "time_trial" | "meet"),
  });

  const removeTime = useMutation(api.times.remove);

  const filteredPBs = useMemo(() => {
    if (!pbs) return [];
    let list = pbs;
    if (filterStroke !== "all") {
      list = list.filter((p) => p.stroke === filterStroke);
    }
    if (filterCourse !== "all") {
      list = list.filter((p) => p.course === filterCourse);
    }
    return list;
  }, [pbs, filterStroke, filterCourse]);

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Personal Bests & Time Log</h3>
          <p className="text-sm text-muted-foreground">
            Official records and race history across short course and long course events.
          </p>
        </div>
        <LogTimeDialog studentId={studentId} studentName={studentName} />
      </div>

      {/* Personal Bests Showcase Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              <CardTitle className="text-base font-semibold">Personal Bests</CardTitle>
            </div>
            {pbs && pbs.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                {pbs.length} Event{pbs.length === 1 ? "" : "s"} Recorded
              </Badge>
            )}
          </div>
          <CardDescription>
            Fastest career times for each stroke, distance, and pool course.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pbs === undefined ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : filteredPBs.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No personal bests yet"
              description="Log practice splits or meet results to establish personal records."
              action={
                <LogTimeDialog
                  studentId={studentId}
                  studentName={studentName}
                  trigger={<Button size="sm" variant="outline">Log First Time</Button>}
                />
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPBs.map((pb) => (
                <div
                  key={`${pb.stroke}-${pb.distanceMeters}-${pb.course}`}
                  className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 p-4 transition-all hover:border-amber-500/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {pb.event}
                      </div>
                      <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                        {pb.formattedTime}
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {pb.course === "short" ? "SCM" : "LCM"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {formatDate(pb.date)}
                    </span>
                    <Badge variant="secondary" className="capitalize text-[10px] px-1.5 py-0">
                      {pb.context.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Results History Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Time Log History</CardTitle>
              <CardDescription>All recorded swims and splits chronologically.</CardDescription>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterStroke} onValueChange={setFilterStroke}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue placeholder="Stroke" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strokes</SelectItem>
                  {strokeOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterCourse} onValueChange={setFilterCourse}>
                <SelectTrigger className="h-8 text-xs w-[110px]">
                  <SelectValue placeholder="Course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  <SelectItem value="short">SCM (25m)</SelectItem>
                  <SelectItem value="long">LCM (50m)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterContext} onValueChange={setFilterContext}>
                <SelectTrigger className="h-8 text-xs w-[110px]">
                  <SelectValue placeholder="Context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contexts</SelectItem>
                  <SelectItem value="time_trial">Time Trial</SelectItem>
                  <SelectItem value="practice">Practice</SelectItem>
                  <SelectItem value="meet">Meet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {times === undefined ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : times.length === 0 ? (
            <EmptyState
              icon={Timer}
              title="No time results match filters"
              description="Try changing the stroke, course, or context filter."
            />
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[60px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {times.map((t) => (
                    <TableRow key={t._id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(t.date)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {t.event}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">
                          {t.course === "short" ? "SCM" : "LCM"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-foreground">
                            {t.formattedTime}
                          </span>
                          {t.isPersonalBest && (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[10px] py-0">
                              <Sparkles className="h-3 w-3 text-amber-500" />
                              PB
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {t.context.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {t.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(t._id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Time Result Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Result</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time entry? Personal best records will recalculate automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try {
                  await removeTime({ id: deleteId });
                  toast.success("Time result deleted.");
                } catch (err) {
                  toast.error(errorMessage(err, "Failed to delete time result"));
                } finally {
                  setDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
