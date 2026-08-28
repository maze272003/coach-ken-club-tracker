import { CheckCircle2, ClipboardCheck, Target, Timer } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatTimeMs } from "@/lib/format";

export type GoalStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "archived";

export type GoalType = "manual" | "time" | "attendance";

export type GoalRecord = {
  _id: string;
  title: string;
  description: string | null;
  type?: GoalType | null;
  distanceMeters?: number | null;
  stroke?: string | null;
  course?: "short" | "long" | null;
  targetTimeMs?: number | null;
  baselineBestMs?: number | null;
  targetAttendancePct?: number | null;
  currentBestMs?: number | null;
  currentAttendancePct?: number | null;
  target: string | null;
  progress: number;
  status: GoalStatus;
  targetDate: string | null;
};

const statusLabels: Record<GoalStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

export function GoalCard({
  goal,
  footer,
}: {
  goal: GoalRecord;
  footer?: React.ReactNode;
}) {
  const goalType = goal.type ?? "manual";

  return (
    <Card className={goal.status === "completed" ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              {goalType === "time" ? (
                <Badge variant="outline" className="text-[11px] gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5">
                  <Timer className="size-3" />
                  Time Target
                </Badge>
              ) : goalType === "attendance" ? (
                <Badge variant="outline" className="text-[11px] gap-1 text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/5">
                  <ClipboardCheck className="size-3" />
                  Attendance
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] gap-1 text-muted-foreground">
                  <Target className="size-3" />
                  Custom Goal
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold leading-snug">
              {goal.title}
            </CardTitle>
          </div>

          <Badge
            variant={goal.status === "completed" ? "default" : "secondary"}
            className={`shrink-0 ${
              goal.status === "completed"
                ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500"
                : ""
            }`}
          >
            {goal.status === "completed" && (
              <CheckCircle2 className="size-3 mr-1" />
            )}
            {statusLabels[goal.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {goal.description ? (
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        ) : null}

        {/* Measurable Time Goal Breakdown */}
        {goalType === "time" && goal.targetTimeMs ? (
          <div className="rounded-lg border bg-muted/40 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between font-medium">
              <span className="text-muted-foreground">Target Time:</span>
              <span className="font-mono font-bold text-foreground">
                {formatTimeMs(goal.targetTimeMs)}{" "}
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({goal.distanceMeters}m {goal.stroke} {goal.course === "short" ? "SCM" : "LCM"})
                </span>
              </span>
            </div>
            {goal.baselineBestMs && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Baseline PB:</span>
                <span className="font-mono">{formatTimeMs(goal.baselineBestMs)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t pt-1">
              <span className="text-muted-foreground">Current Fastest:</span>
              <span className="font-mono font-semibold text-primary">
                {goal.currentBestMs ? (
                  formatTimeMs(goal.currentBestMs)
                ) : (
                  <span className="text-muted-foreground">No time logged yet</span>
                )}
              </span>
            </div>
          </div>
        ) : null}

        {/* Measurable Attendance Goal Breakdown */}
        {goalType === "attendance" && goal.targetAttendancePct ? (
          <div className="rounded-lg border bg-muted/40 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between font-medium">
              <span className="text-muted-foreground">Target Attendance:</span>
              <span className="font-bold text-foreground">{goal.targetAttendancePct}%</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1">
              <span className="text-muted-foreground">Current Consistency:</span>
              <span className="font-semibold text-primary">
                {goal.currentAttendancePct !== null && goal.currentAttendancePct !== undefined
                  ? `${goal.currentAttendancePct}%`
                  : "0%"}
              </span>
            </div>
          </div>
        ) : null}

        {/* Legacy / Manual Goal Target Text */}
        {goalType === "manual" && goal.target ? (
          <p className="text-sm">
            <span className="font-medium">Target:</span>{" "}
            <span className="text-muted-foreground">{goal.target}</span>
          </p>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {goal.progress}%
            </span>
          </div>
          <Progress
            value={goal.progress}
            aria-label={`Goal progress: ${goal.progress} percent`}
            className={goal.status === "completed" ? "[&>div]:bg-emerald-600" : ""}
          />
        </div>

        {goal.targetDate ? (
          <p className="text-xs text-muted-foreground">
            Target date: {formatDate(goal.targetDate)}
          </p>
        ) : null}
      </CardContent>

      {footer ? (
        <CardFooter className="pt-0">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
