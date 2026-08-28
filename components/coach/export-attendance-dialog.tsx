"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Download, FileSpreadsheet, Filter, Users, User } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { todayDateString } from "@/lib/format";
import { cn } from "@/lib/utils";

type DatePreset = "all" | "this_month" | "last_30_days" | "custom";
type StatusFilter = "all" | "present" | "late" | "absent";

function getDateRangeForPreset(preset: DatePreset): {
  startDate: string;
  endDate: string;
} {
  const today = todayDateString();
  if (preset === "all") {
    return { startDate: "", endDate: "" };
  }
  if (preset === "this_month") {
    const startOfMonth = `${today.slice(0, 7)}-01`;
    return { startDate: startOfMonth, endDate: today };
  }
  if (preset === "last_30_days") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return { startDate: `${y}-${m}-${day}`, endDate: today };
  }
  return { startDate: "", endDate: "" };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function ExportAttendanceDialog({
  preselectedStudentId,
  trigger,
}: {
  preselectedStudentId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "specific">(
    preselectedStudentId ? "specific" : "all",
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    preselectedStudentId ?? "",
  );
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [startDate, setStartDate] = useState(() =>
    getDateRangeForPreset("this_month").startDate,
  );
  const [endDate, setEndDate] = useState(() =>
    getDateRangeForPreset("this_month").endDate,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const students = useQuery(api.students.list, {});

  // Build query args
  const queryArgs = useMemo(() => {
    const studentIdArg =
      scope === "specific" && selectedStudentId
        ? (selectedStudentId as Id<"students">)
        : undefined;

    const startDateArg = startDate.trim() ? startDate.trim() : undefined;
    const endDateArg = endDate.trim() ? endDate.trim() : undefined;
    const statusArg =
      statusFilter !== "all" ? statusFilter : undefined;

    return {
      studentId: studentIdArg,
      startDate: startDateArg,
      endDate: endDateArg,
      status: statusArg,
    };
  }, [scope, selectedStudentId, startDate, endDate, statusFilter]);

  const exportData = useQuery(api.attendance.exportAttendance, queryArgs);

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId || !students) return null;
    return students.find((s) => s.studentId === selectedStudentId);
  }, [selectedStudentId, students]);

  function handlePresetChange(preset: DatePreset) {
    setDatePreset(preset);
    if (preset !== "custom") {
      const range = getDateRangeForPreset(preset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }

  function handleDownloadCsv() {
    if (!exportData || exportData.records.length === 0) {
      toast.error("No attendance records found for the selected filters.");
      return;
    }

    const headers = [
      "Student Name",
      "Student Email",
      "Group",
      "Attendance Date",
      "Status",
      "Training Sessions",
      "Training Duration (Mins)",
      "Training Distance (Meters)",
      "Strokes Practiced",
      "Training Notes",
      "Recorded Swim Times & Splits",
      "Personal Bests Set Today",
      "Time Notes",
      "Last Updated (UTC)",
    ];

    const rows = exportData.records.map((record) => [
      escapeCsvCell(record.studentName),
      escapeCsvCell(record.studentEmail),
      escapeCsvCell(record.groupName ?? "Unassigned"),
      escapeCsvCell(record.date),
      escapeCsvCell(record.status.toUpperCase()),
      escapeCsvCell(record.trainingSummary),
      escapeCsvCell(record.totalTrainingMinutes),
      escapeCsvCell(record.totalDistanceMeters || ""),
      escapeCsvCell(record.strokesPracticed.join(", ")),
      escapeCsvCell(record.sessionNotes ?? ""),
      escapeCsvCell(record.timesSummary),
      escapeCsvCell(record.personalBestsAchieved.join("; ")),
      escapeCsvCell(record.timeNotes ?? ""),
      escapeCsvCell(new Date(record.updatedAt).toISOString()),
    ]);


    const csvContent =
      "\uFEFF" +
      [
        headers.map((h) => `"${h}"`).join(","),
        ...rows.map((r) => r.join(",")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const scopeName =
      scope === "specific" && selectedStudent
        ? selectedStudent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        : "all-students";

    const dateRangeSuffix =
      startDate && endDate
        ? `${startDate}_to_${endDate}`
        : startDate
          ? `from_${startDate}`
          : endDate
            ? `until_${endDate}`
            : "all-time";

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `attendance_${scopeName}_${dateRangeSuffix}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      `Exported ${exportData.records.length} attendance record${
        exportData.records.length === 1 ? "" : "s"
      } to CSV.`,
    );
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="size-4" aria-hidden="true" />
            <span>Export Attendance</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" aria-hidden="true" />
            Export Attendance Records
          </DialogTitle>
          <DialogDescription>
            Customize your export scope (all students or a specific student), date range, and status filter to download a CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Scope Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Student Scope
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={scope === "all" ? "default" : "outline"}
                className={cn(
                  "justify-start gap-2",
                  scope === "all" && "shadow-xs",
                )}
                onClick={() => setScope("all")}
              >
                <Users className="size-4" />
                <span>All Students</span>
              </Button>
              <Button
                type="button"
                variant={scope === "specific" ? "default" : "outline"}
                className={cn(
                  "justify-start gap-2",
                  scope === "specific" && "shadow-xs",
                )}
                onClick={() => setScope("specific")}
              >
                <User className="size-4" />
                <span>Specific Student</span>
              </Button>
            </div>

            {scope === "specific" && (
              <div className="pt-2">
                <Label htmlFor="export-student-select" className="sr-only">
                  Select Student
                </Label>
                <Select
                  value={selectedStudentId}
                  onValueChange={setSelectedStudentId}
                >
                  <SelectTrigger
                    id="export-student-select"
                    className="w-full"
                  >
                    <SelectValue placeholder="Choose a student..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.map((student) => (
                      <SelectItem
                        key={student.studentId}
                        value={student.studentId}
                      >
                        {student.name} ({student.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Date Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Date Range
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "this_month", label: "This Month" },
                  { id: "last_30_days", label: "Last 30 Days" },
                  { id: "all", label: "All Time" },
                  { id: "custom", label: "Custom Range" },
                ] as const
              ).map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant={datePreset === preset.id ? "secondary" : "ghost"}
                  className={cn(
                    "text-xs h-7",
                    datePreset === preset.id && "bg-secondary font-medium",
                  )}
                  onClick={() => handlePresetChange(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label htmlFor="export-start-date" className="text-xs text-muted-foreground">
                  From Date
                </Label>
                <Input
                  id="export-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="export-end-date" className="text-xs text-muted-foreground">
                  To Date
                </Label>
                <Input
                  id="export-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </div>
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status Filter
            </Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "all", label: "All Statuses" },
                  { id: "present", label: "Present Only" },
                  { id: "late", label: "Late Only" },
                  { id: "absent", label: "Absent Only" },
                ] as const
              ).map((status) => (
                <Button
                  key={status.id}
                  type="button"
                  size="sm"
                  variant={statusFilter === status.id ? "default" : "outline"}
                  className={cn(
                    "text-xs h-8",
                    statusFilter === status.id &&
                      (status.id === "present"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : status.id === "late"
                          ? "bg-amber-500 hover:bg-amber-600 text-white"
                          : status.id === "absent"
                            ? "bg-rose-600 hover:bg-rose-700 text-white"
                            : ""),
                  )}
                  onClick={() => setStatusFilter(status.id)}
                >
                  {status.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Export Preview Summary Card */}
          <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Filter className="size-3.5" />
                Data Preview
              </span>
              {exportData === undefined ? (
                <span>Loading preview...</span>
              ) : (
                <span>
                  <strong>{exportData.stats.total}</strong> record
                  {exportData.stats.total === 1 ? "" : "s"} found
                </span>
              )}
            </div>

            {exportData === undefined ? (
              <Skeleton className="h-6 w-full" />
            ) : exportData.stats.total > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline" className="bg-background text-emerald-700 border-emerald-300 dark:text-emerald-400">
                  Present: {exportData.stats.present}
                </Badge>
                <Badge variant="outline" className="bg-background text-amber-700 border-amber-300 dark:text-amber-400">
                  Late: {exportData.stats.late}
                </Badge>
                <Badge variant="outline" className="bg-background text-rose-700 border-rose-300 dark:text-rose-400">
                  Absent: {exportData.stats.absent}
                </Badge>
                {exportData.stats.percentage !== null && (
                  <Badge variant="secondary" className="bg-background font-medium">
                    Attendance Rate: {exportData.stats.percentage}%
                  </Badge>
                )}
                {exportData.stats.totalTrainingMinutes > 0 && (
                  <Badge variant="outline" className="bg-background text-primary border-primary/30">
                    Training: {exportData.stats.totalTrainingMinutes} mins{exportData.stats.totalDistanceMeters > 0 ? ` (${exportData.stats.totalDistanceMeters}m)` : ""}
                  </Badge>
                )}
                {exportData.stats.totalTimesRecorded > 0 && (
                  <Badge variant="outline" className="bg-background text-indigo-700 border-indigo-300 dark:text-indigo-400">
                    Times Recorded: {exportData.stats.totalTimesRecorded}
                  </Badge>
                )}
                {exportData.stats.totalPBsAchieved > 0 && (
                  <Badge variant="outline" className="bg-background text-amber-700 border-amber-300 dark:text-amber-400">
                    PBs Set: {exportData.stats.totalPBsAchieved}
                  </Badge>
                )}
              </div>

            ) : (
              <p className="text-xs text-muted-foreground italic">
                No attendance entries match the selected filters.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={
              exportData === undefined ||
              exportData.records.length === 0 ||
              (scope === "specific" && !selectedStudentId)
            }
            onClick={handleDownloadCsv}
          >
            <Download className="size-4" />
            <span>Download CSV ({exportData?.records.length ?? 0})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
