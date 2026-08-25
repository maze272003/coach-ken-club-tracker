import { CalendarCheck, CalendarX, CalendarClock, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type AttendanceSummaryData = {
  total: number;
  attended: number;
  present: number;
  late: number;
  absent: number;
  percentage: number | null;
};

export function AttendanceSummary({
  stats,
}: {
  stats: AttendanceSummaryData;
}) {
  const items = [
    {
      icon: CalendarCheck,
      label: "Days attended",
      value: stats.attended,
    },
    {
      icon: CalendarClock,
      label: "Late arrivals",
      value: stats.late,
    },
    {
      icon: CalendarX,
      label: "Days absent",
      value: stats.absent,
    },
    {
      icon: ListChecks,
      label: "Total sessions",
      value: stats.total,
    },
  ];
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              Attendance rate
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {stats.percentage === null ? "—" : `${stats.percentage}%`}
            </span>
          </div>
          <Progress
            value={stats.percentage ?? 0}
            aria-label={`Attendance rate: ${stats.percentage === null ? "no records" : stats.percentage + " percent"}`}
          />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label}>
            <CardContent className="space-y-1 p-4">
              <item.icon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xl font-semibold tabular-nums">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
