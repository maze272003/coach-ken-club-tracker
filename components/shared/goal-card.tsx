import { Target } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";

export type GoalStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "archived";

export type GoalRecord = {
  _id: string;
  title: string;
  description: string | null;
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
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-start gap-2 text-base leading-snug">
            <Target
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            {goal.title}
          </CardTitle>
          <Badge
            variant={goal.status === "completed" ? "default" : "secondary"}
            className="shrink-0"
          >
            {statusLabels[goal.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        {goal.description ? (
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        ) : null}
        {goal.target ? (
          <p className="text-sm">
            <span className="font-medium">Target:</span>{" "}
            <span className="text-muted-foreground">{goal.target}</span>
          </p>
        ) : null}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-sm font-semibold tabular-nums">
              {goal.progress}%
            </span>
          </div>
          <Progress
            value={goal.progress}
            aria-label={`Goal progress: ${goal.progress} percent`}
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
