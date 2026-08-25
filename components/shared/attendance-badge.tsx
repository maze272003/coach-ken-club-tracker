import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AttendanceStatus = "present" | "late" | "absent";

const styles: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  late: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  absent: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export function AttendanceBadge({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(styles[status], className)}>
      {status === "present" ? "Present" : status === "late" ? "Late" : "Absent"}
    </Badge>
  );
}
