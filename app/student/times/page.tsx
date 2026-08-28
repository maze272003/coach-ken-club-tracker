"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Award,
  Calendar,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { ValidStroke } from "@/convex/lib/validation";

const strokeOptions = [
  { value: "freestyle", label: "Freestyle" },
  { value: "backstroke", label: "Backstroke" },
  { value: "breaststroke", label: "Breaststroke" },
  { value: "butterfly", label: "Butterfly" },
  { value: "im", label: "Individual Medley (IM)" },
] as const;

export default function StudentTimesPage() {
  const [filterStroke, setFilterStroke] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterContext, setFilterContext] = useState<string>("all");

  const pbs = useQuery(api.times.myPersonalBests, {});
  const times = useQuery(api.times.myTimes, {
    stroke: filterStroke === "all" ? undefined : (filterStroke as ValidStroke),
    course: filterCourse === "all" ? undefined : (filterCourse as "short" | "long"),
    context: filterContext === "all" ? undefined : (filterContext as "practice" | "time_trial" | "meet"),
  });


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
      <PageHeader
        title="My Swim Times & Personal Bests"
        description="Track your career milestones, personal best drops, and practice time trials."
      />

      {/* Personal Bests Showcase Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              <CardTitle className="text-base font-semibold">My Personal Bests</CardTitle>
            </div>
            {pbs && pbs.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                {pbs.length} Record{pbs.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <CardDescription>
            Your fastest official times across short course and long course events.
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
              description="Join practice time trials and swim meets to set your benchmark times."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPBs.map((pb) => (
                <div
                  key={`${pb.stroke}-${pb.distanceMeters}-${pb.course}`}
                  className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-amber-500/5 p-4 transition-all hover:border-amber-500/40 hover:shadow-sm"
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

      {/* Full Swim Times History Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Swim Time History</CardTitle>
              <CardDescription>All your recorded practice splits, trials, and meet swims.</CardDescription>
            </div>

            {/* Filter Bar */}
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
              title="No swim times recorded"
              description="Your coach will record your splits and trial times here."
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
                    <TableHead>Coach Notes</TableHead>
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
                      <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                        {t.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
