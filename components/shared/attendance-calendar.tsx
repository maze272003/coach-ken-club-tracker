"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type DaySummary = {
  present: number;
  late: number;
  absent: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function AttendanceCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  summary,
  className,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  summary?: Record<string, DaySummary>;
  className?: string;
}) {
  const today = toDateString(new Date());

  const days = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year!, monthNumber! - 1, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        key: toDateString(d),
        day: d.getDate(),
        inMonth: monthKey(d) === month,
      };
    });
  }, [month]);

  function shiftMonth(delta: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(year!, monthNumber! - 1 + delta, 1);
    onMonthChange(monthKey(next));
  }

  function handleSelect(date: string) {
    onSelectDate(date);
    const dateMonth = date.slice(0, 7);
    if (dateMonth !== month) onMonthChange(dateMonth);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p className="text-sm font-semibold capitalize" aria-live="polite">
          {new Date(
            Number(month.slice(0, 4)),
            Number(month.slice(5, 7)) - 1,
            1,
          ).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            className="py-1 text-xs font-medium text-muted-foreground"
          >
            {weekday}
          </span>
        ))}
        {days.map((day) => {
          const daySummary = summary?.[day.key];
          const selected = day.key === selectedDate;
          return (
            <button
              type="button"
              key={day.key}
              onClick={() => handleSelect(day.key)}
              aria-pressed={selected}
              aria-current={day.key === today ? "date" : undefined}
              title={
                daySummary
                  ? `${daySummary.present} present, ${daySummary.late} late, ${daySummary.absent} absent`
                  : undefined
              }
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                !day.inMonth && "text-muted-foreground/40",
                !selected && day.key === today && "font-semibold text-primary",
                selected &&
                  "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <span>{day.day}</span>
              <span className="flex h-1.5 items-center gap-1">
                {daySummary && daySummary.present > 0 ? (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      selected ? "bg-primary-foreground" : "bg-emerald-500",
                    )}
                  />
                ) : null}
                {daySummary && daySummary.late > 0 ? (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      selected ? "bg-primary-foreground" : "bg-amber-500",
                    )}
                  />
                ) : null}
                {daySummary && daySummary.absent > 0 ? (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      selected ? "bg-primary-foreground" : "bg-rose-500",
                    )}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Present
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
          Late
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-500" aria-hidden="true" />
          Absent
        </span>
      </div>
    </div>
  );
}
