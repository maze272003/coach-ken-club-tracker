"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Award,
  Download,
  Flame,
  Search,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  errorMessage,
  formatDate,
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

function loadDraft(key: string): Record<string, { timeInput: string; notes: string }> {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export default function CoachTimesPage() {
  const [activeTab, setActiveTab] = useState<"trial" | "log">("trial");

  // Time Trial Sheet State
  const [trialGroup, setTrialGroup] = useState<string>("all");
  const [trialStroke, setTrialStroke] = useState<string>("freestyle");
  const [trialDistance, setTrialDistance] = useState<number>(50);
  const [trialCourse, setTrialCourse] = useState<"short" | "long">("short");
  const [trialDate, setTrialDate] = useState(todayDateString());
  const [trialContext, setTrialContext] = useState<"practice" | "time_trial" | "meet">("time_trial");

  // Session Storage Draft Key
  const draftKey = `draft_time_trial_${trialGroup}_${trialDate}_${trialStroke}_${trialDistance}_${trialCourse}`;
  const [currentDraftKey, setCurrentDraftKey] = useState(draftKey);
  const [entries, setEntries] = useState<Record<string, { timeInput: string; notes: string }>>(() =>
    loadDraft(draftKey),
  );

  if (currentDraftKey !== draftKey) {
    setCurrentDraftKey(draftKey);
    setEntries(loadDraft(draftKey));
  }

  const draftRestored = Object.keys(entries).length > 0;
  const [saving, setSaving] = useState(false);

  // PB Celebration Modal State
  const [celebrationPBs, setCelebrationPBs] = useState<
    Array<{
      studentName: string;
      formattedTime: string;
      deltaMs: number | null;
      deltaPct: number | null;
    }> | null
  >(null);

  // Squad Log Filters
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterStroke, setFilterStroke] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [deleteTimeId, setDeleteTimeId] = useState<Id<"timeResults"> | null>(null);

  // Convex Queries & Mutations
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");

  const students = useQuery(api.students.list, {
    groupId:
      trialGroup === "all"
        ? undefined
        : trialGroup === "unassigned"
          ? null
          : (trialGroup as Id<"groups">),
  });

  const timeLogData = useQuery(api.times.exportTimes, {
    groupId:
      filterGroup === "all" || filterGroup === "unassigned"
        ? undefined
        : (filterGroup as Id<"groups">),
    stroke: filterStroke === "all" ? undefined : (filterStroke as ValidStroke),
    course: filterCourse === "all" ? undefined : (filterCourse as "short" | "long"),
  });

  const recordBulk = useMutation(api.times.recordBulk);
  const removeTime = useMutation(api.times.remove);


  const handleTimeChange = (studentId: string, value: string) => {
    setEntries((prev) => {
      const updated = {
        ...prev,
        [studentId]: {
          timeInput: value,
          notes: prev[studentId]?.notes ?? "",
        },
      };
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleNotesChange = (studentId: string, value: string) => {
    setEntries((prev) => {
      const updated = {
        ...prev,
        [studentId]: {
          timeInput: prev[studentId]?.timeInput ?? "",
          notes: value,
        },
      };
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleSaveTrial = async () => {
    const activeStudents = (students ?? []).filter((s) => s.status === "active");
    const validEntries: Array<{ studentId: Id<"students">; timeMs: number; notes?: string }> = [];

    for (const student of activeStudents) {
      const entry = entries[student.studentId];
      if (!entry || !entry.timeInput.trim()) continue;

      const timeMs = parseTimeToMs(entry.timeInput);
      if (timeMs === null) {
        toast.error(`Invalid time format for ${student.name}. Enter e.g. 28.45 or 1:04.25`);
        return;
      }

      validEntries.push({
        studentId: student.studentId,
        timeMs,
        notes: entry.notes.trim() || undefined,
      });
    }

    if (validEntries.length === 0) {
      toast.error("Enter at least one swimmer's time to record a time trial.");
      return;
    }

    if (trialGroup === "all" || trialGroup === "unassigned") {
      toast.error("Please select a specific training group to record a group time trial.");
      return;
    }

    setSaving(true);
    try {
      const res = await recordBulk({
        groupId: trialGroup as Id<"groups">,
        date: trialDate,
        stroke: trialStroke as ValidStroke,
        distanceMeters: trialDistance,
        course: trialCourse,
        context: trialContext,
        entries: validEntries,
      });


      sessionStorage.removeItem(draftKey);
      setEntries({});
      setDraftRestored(false);

      if (res.newPersonalBests.length > 0) {
        setCelebrationPBs(res.newPersonalBests);
        toast.success(`Saved! ${res.newPersonalBests.length} new Personal Bests achieved!`);
      } else {
        toast.success(`Recorded ${res.recordedCount} time results successfully.`);
      }
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save time trial"));
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (!timeLogData || timeLogData.records.length === 0) {
      toast.error("No time records available to export.");
      return;
    }

    const headers = [
      "Date",
      "Swimmer",
      "Group",
      "Event",
      "Course",
      "Time (Formatted)",
      "Time (Milliseconds)",
      "Context",
      "Is Personal Best",
      "Notes",
    ];

    const rows = timeLogData.records.map((r) => [
      r.date,
      `"${r.studentName.replace(/"/g, '""')}"`,
      `"${(r.groupName ?? "Unassigned").replace(/"/g, '""')}"`,
      `"${r.event.replace(/"/g, '""')}"`,
      r.course === "short" ? "SCM" : "LCM",
      r.formattedTime,
      r.timeMs,
      r.context,
      r.isPersonalBest ? "YES" : "NO",
      `"${(r.notes ?? "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `coachken-swim-times-${todayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export downloaded successfully.");
  };

  const filteredLogRecords = useMemo(() => {
    if (!timeLogData?.records) return [];
    let list = timeLogData.records;
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      list = list.filter((r) => r.studentName.toLowerCase().includes(q) || r.event.toLowerCase().includes(q));
    }
    return list;
  }, [timeLogData, filterSearch]);

  const activeStudentsList = (students ?? []).filter((s) => s.status === "active");

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        title="Swim Times & Time Trials"
        description="Record fast group time trials, view squad Personal Bests, and track meet performance."
        actions={
          <Button variant="outline" onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "trial" | "log")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="trial" className="gap-2">
            <Flame className="h-4 w-4 text-amber-500" />
            Time Trial Sheet
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Squad Time Log & PBs
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: GROUP TIME TRIAL SHEET */}
        {/* ============================================================ */}
        <TabsContent value="trial" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center justify-between">
                <span>Time Trial Setup</span>
                {draftRestored && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Draft Restored from Session
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Select group and event parameters, then rapidly enter split times below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {/* Group Selector */}
                <div className="space-y-1.5">
                  <Label>Training Group</Label>
                  <Select value={trialGroup} onValueChange={setTrialGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      {activeGroups.map((g) => (
                        <SelectItem key={g.groupId} value={g.groupId}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Stroke Selector */}
                <div className="space-y-1.5">
                  <Label>Stroke</Label>
                  <Select value={trialStroke} onValueChange={setTrialStroke}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stroke" />
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

                {/* Distance Selector */}
                <div className="space-y-1.5">
                  <Label>Distance</Label>
                  <Select
                    value={String(trialDistance)}
                    onValueChange={(val) => setTrialDistance(parseInt(val, 10))}
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

                {/* Course Selector */}
                <div className="space-y-1.5">
                  <Label>Pool Course</Label>
                  <Select value={trialCourse} onValueChange={(v) => setTrialCourse(v as "short" | "long")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short Course (25m SCM)</SelectItem>
                      <SelectItem value="long">Long Course (50m LCM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Input */}
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={trialDate}
                    onChange={(e) => setTrialDate(e.target.value)}
                  />
                </div>

                {/* Context Selector */}
                <div className="space-y-1.5">
                  <Label>Context</Label>
                  <Select value={trialContext} onValueChange={(v) => setTrialContext(v as "practice" | "time_trial" | "meet")}>

                    <SelectTrigger>
                      <SelectValue placeholder="Context" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_trial">Time Trial</SelectItem>
                      <SelectItem value="practice">Practice Set</SelectItem>
                      <SelectItem value="meet">Swim Meet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Time Trial Swimmers Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Swimmers Sheet</CardTitle>
                <CardDescription>
                  Enter times formatted as <code className="text-primary font-mono font-semibold">28.45</code> or{" "}
                  <code className="text-primary font-mono font-semibold">1:04.25</code>
                </CardDescription>
              </div>
              <Button
                onClick={handleSaveTrial}
                disabled={saving || activeStudentsList.length === 0}
                className="gap-2"
              >
                <Timer className="h-4 w-4" />
                {saving ? "Saving..." : "Save Time Trial"}
              </Button>
            </CardHeader>
            <CardContent>
              {students === undefined ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : activeStudentsList.length === 0 ? (
                <EmptyState
                  icon={Timer}
                  title="No active swimmers found"
                  description="Select another group or add active swimmers to this group to record times."
                />
              ) : (

                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[280px]">Swimmer</TableHead>
                        <TableHead className="w-[180px]">Current PB</TableHead>
                        <TableHead className="w-[220px]">Time (e.g. 28.45)</TableHead>
                        <TableHead>Notes / Feedback</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeStudentsList.map((student) => {
                        const studentEntry = entries[student.studentId] ?? {
                          timeInput: "",
                          notes: "",
                        };
                        const parsedMs = studentEntry.timeInput.trim()
                          ? parseTimeToMs(studentEntry.timeInput)
                          : null;
                        const isInvalid =
                          studentEntry.timeInput.trim() !== "" && parsedMs === null;

                        return (
                          <TableRow key={student.studentId}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3">
                                <StudentAvatar name={student.name} image={student.image} />
                                <div>
                                  <div className="font-medium text-foreground">{student.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {student.groupName ?? "Unassigned"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="text-sm font-mono text-muted-foreground">
                                --:--.--
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="space-y-1">
                                <Input
                                  placeholder="ss.cs or m:ss.cs"
                                  value={studentEntry.timeInput}
                                  onChange={(e) =>
                                    handleTimeChange(student.studentId, e.target.value)
                                  }
                                  className={`font-mono ${
                                    isInvalid
                                      ? "border-destructive focus-visible:ring-destructive"
                                      : parsedMs !== null
                                        ? "border-emerald-500/50 bg-emerald-500/5"
                                        : ""
                                  }`}
                                />
                                {isInvalid && (
                                  <p className="text-[11px] text-destructive">
                                    Invalid (e.g. 28.45 or 1:04.25)
                                  </p>
                                )}
                              </div>
                            </TableCell>

                            <TableCell>
                              <Input
                                placeholder="Optional split or feedback notes..."
                                value={studentEntry.notes}
                                onChange={(e) =>
                                  handleNotesChange(student.studentId, e.target.value)
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            <DialogFooter className="px-6 py-4 border-t flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Entries are auto-saved to session storage as you type.
              </div>
              <Button
                onClick={handleSaveTrial}
                disabled={saving || activeStudentsList.length === 0}
                className="gap-2"
              >
                <Timer className="h-4 w-4" />
                {saving ? "Saving..." : "Save Time Trial"}
              </Button>
            </DialogFooter>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: SQUAD TIME LOG & DIRECTORY */}
        {/* ============================================================ */}
        <TabsContent value="log" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">Squad Time History & PBs</CardTitle>
                  <CardDescription>
                    All recorded practice, trial, and meet times across the squad.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search swimmer or event..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                <Select value={filterGroup} onValueChange={setFilterGroup}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All Groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups</SelectItem>
                    {activeGroups.map((g) => (
                      <SelectItem key={g.groupId} value={g.groupId}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterStroke} onValueChange={setFilterStroke}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All Strokes" />
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
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All Courses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Courses</SelectItem>
                    <SelectItem value="short">Short Course (SCM)</SelectItem>
                    <SelectItem value="long">Long Course (LCM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {timeLogData === undefined ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : filteredLogRecords.length === 0 ? (
                <EmptyState
                  icon={Trophy}
                  title="No swim times recorded"
                  description="Run a time trial or log individual swimmer results to build performance records."
                />
              ) : (

                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Swimmer</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Course</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Context</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-[80px] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogRecords.map((record) => (
                        <TableRow key={record._id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(record.date)}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>
                              <div>{record.studentName}</div>
                              {record.groupName && (
                                <div className="text-[11px] text-muted-foreground">
                                  {record.groupName}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {record.event}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-mono">
                              {record.course === "short" ? "SCM" : "LCM"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-foreground">
                                {record.formattedTime}
                              </span>
                              {record.isPersonalBest && (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[11px]">
                                  <Sparkles className="h-3 w-3 text-amber-500" />
                                  PB
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize text-xs">
                              {record.context.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {record.notes ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTimeId(record._id)}
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
        </TabsContent>
      </Tabs>

      {/* Celebratory PB Summary Modal */}
      <Dialog open={celebrationPBs !== null} onOpenChange={(open) => !open && setCelebrationPBs(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-500 mb-1">
              <Trophy className="h-6 w-6" />
              <DialogTitle className="text-xl">New Personal Bests!</DialogTitle>
            </div>
            <DialogDescription>
              Great work! The following swimmers achieved new personal best records:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            {celebrationPBs?.map((pb, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10"
              >
                <div className="flex items-center gap-2.5">
                  <Award className="h-5 w-5 text-amber-500" />
                  <div>
                    <div className="font-semibold text-foreground">{pb.studentName}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {pb.formattedTime}
                    </div>
                  </div>
                </div>
                {pb.deltaMs !== null && pb.deltaPct !== null ? (
                  <Badge className="bg-emerald-500 text-white font-mono text-xs">
                    -{(pb.deltaMs / 1000).toFixed(2)}s (-{pb.deltaPct}%)
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    First PB!
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setCelebrationPBs(null)} className="w-full">
              Awesome, Keep Going!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteTimeId !== null} onOpenChange={(open) => !open && setDeleteTimeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Result</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time result? Personal bests and goal progress will
              automatically recalculate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTimeId) return;
                try {
                  await removeTime({ id: deleteTimeId });
                  toast.success("Time result deleted.");
                } catch (err) {
                  toast.error(errorMessage(err, "Failed to delete time result"));
                } finally {
                  setDeleteTimeId(null);
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
