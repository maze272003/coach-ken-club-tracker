"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { AttendanceCalendar } from "@/components/shared/attendance-calendar";
import { CompletePracticeDialog } from "@/components/coach/complete-practice-dialog";
import { ExportAttendanceDialog } from "@/components/coach/export-attendance-dialog";
import { Card, CardContent } from "@/components/ui/card";
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

const statusButtons = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
] as const;

type StatusValue = (typeof statusButtons)[number]["value"];

const buttonStyles: Record<StatusValue, string> = {
  present:
    "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600",
  late: "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-400 dark:hover:bg-amber-500",
  absent:
    "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600",
};

const chipStyles: Record<StatusValue, string> = {
  present:
    "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  late: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400",
  absent:
    "bg-rose-600/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

export default function CoachAttendancePage() {
  const [date, setDate] = useState(todayDateString());
  const [month, setMonth] = useState(() => todayDateString().slice(0, 7));
  const [groupFilter, setGroupFilter] = useState("all");
  const scope = `${date}|${groupFilter}`;
  const [state, setState] = useState<{
    scope: string;
    overrides: Record<string, "present" | "late" | "absent">;
    error: string | null;
  }>({ scope, overrides: {}, error: null });
  // Marks and errors belong to one (date, group) view — switching
  // either starts a clean sheet without discarding saved records.
  const overrides = state.scope === scope ? state.overrides : {};
  const error = state.scope === scope ? state.error : null;
  const [saving, setSaving] = useState(false);

  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");
  const monthSummary = useQuery(api.attendance.monthSummary, { month });
  const rollCall = useQuery(api.attendance.rollCall, {
    date,
    groupId:
      groupFilter === "all"
        ? undefined
        : groupFilter === "unassigned"
          ? null
          : (groupFilter as never),
  });
  const recordBulk = useMutation(api.attendance.recordBulk);
  const dayPractices = useQuery(
    api.practices.listForGroup,
    groupFilter !== "all" && groupFilter !== "unassigned"
      ? {
          groupId: groupFilter as never,
          fromDate: date,
          toDate: date,
        }
      : "skip",
  );

  const rows = (rollCall ?? []).map((row) => ({
    ...row,
    status: overrides[row.studentId] ?? row.status,
  }));

  const counts = useMemo(() => {
    const result = { present: 0, late: 0, absent: 0, unmarked: 0 };
    for (const row of rows) {
      if (row.status === null) result.unmarked += 1;
      else result[row.status] += 1;
    }
    return result;
  }, [rows]);

  const plannedPractice =
    dayPractices !== undefined
      ? (dayPractices.find((p) => p.status === "planned") ?? null)
      : null;

  function setStatus(studentId: string, status: "present" | "late" | "absent") {
    setState((prev) => ({
      scope,
      overrides: {
        ...(prev.scope === scope ? prev.overrides : {}),
        [studentId]: status,
      },
      error: null,
    }));
  }

  function markAllPresent() {
    const next: Record<string, "present" | "late" | "absent"> = {};
    for (const row of rollCall ?? []) {
      if ((overrides[row.studentId] ?? row.status) === null) {
        next[row.studentId] = "present";
      }
    }
    setState((prev) => ({
      scope,
      overrides: {
        ...(prev.scope === scope ? prev.overrides : {}),
        ...next,
      },
      error: null,
    }));
  }

  async function saveRollCall() {
    if (saving) return;
    const entries = rows
      .filter((row) => row.status !== null)
      .map((row) => ({
        studentId: row.studentId as never,
        status: row.status as "present" | "late" | "absent",
      }));
    if (entries.length === 0) {
      setState((prev) => ({
        scope,
        overrides: prev.scope === scope ? prev.overrides : {},
        error: "Mark at least one swimmer before saving.",
      }));
      return;
    }
    setSaving(true);
    try {
      const result = await recordBulk({ date, entries });
      toast.success(`Roll call saved for ${result.recorded} swimmers.`);
      setState({ scope, overrides: {}, error: null });
      setSaving(false);
    } catch (err) {
      setState({
        scope,
        overrides,
        error: errorMessage(err, "Unable to save attendance. Please try again."),
      });
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Pick a date on the calendar to view and record roll call."
        actions={<ExportAttendanceDialog />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <AttendanceCalendar
              month={month}
              onMonthChange={setMonth}
              selectedDate={date}
              onSelectDate={setDate}
              summary={monthSummary ?? {}}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{formatDate(date)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {rows.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {statusButtons.map((button) => (
                      <span
                        key={button.value}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          chipStyles[button.value],
                        )}
                      >
                        {button.label}: {counts[button.value]}
                      </span>
                    ))}
                    {counts.unmarked > 0 ? (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Not marked: {counts.unmarked}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger
                    className="w-40"
                    aria-label="Filter roll call by group"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {activeGroups.map((group) => (
                      <SelectItem key={group.groupId} value={group.groupId}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={markAllPresent}
                disabled={saving || rollCall === undefined}
              >
                Mark all present
              </Button>
              <Button
                size="sm"
                onClick={() => void saveRollCall()}
                disabled={
                  saving || rollCall === undefined || Object.keys(overrides).length === 0
                }
              >
                {saving ? "Saving…" : "Save Roll Call"}
              </Button>
              {plannedPractice ? (
                <CompletePracticeDialog
                  practice={plannedPractice}
                  triggerLabel="Complete Practice"
                />
              ) : null}
            </div>

            {rollCall === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : rollCall.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="No active students"
                description="Create students to start recording attendance."
              />
            ) : (
              <ul className="divide-y">
                {rows.map((row) => (
                  <li
                    key={row.studentId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <StudentAvatar name={row.name} className="size-9" />
                      <span className="font-medium">{row.name}</span>
                    </div>
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Attendance for ${row.name}`}
                    >
                      {statusButtons.map((button) => {
                        const active = row.status === button.value;
                        return (
                          <Button
                            key={button.value}
                            size="sm"
                            variant={active ? "default" : "outline"}
                            className={
                              active ? buttonStyles[button.value] : undefined
                            }
                            disabled={saving}
                            aria-pressed={active}
                            onClick={() =>
                              setStatus(row.studentId, button.value)
                            }
                          >
                            {button.label}
                          </Button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
