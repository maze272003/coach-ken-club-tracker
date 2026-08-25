import { CalendarDays, Clock, Waves } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, strokeLabel } from "@/lib/format";

export type SessionRecord = {
  _id: string;
  date: string;
  title: string;
  durationMinutes: number;
  strokes: string[];
  notes: string | null;
};

export function TrainingSessionCard({
  session,
  footer,
}: {
  session: SessionRecord;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">
            {session.title}
          </CardTitle>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDate(session.date)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {formatDate(session.date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" />
            {session.durationMinutes} minutes
          </span>
        </div>
        {session.strokes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Strokes">
            {session.strokes.map((stroke) => (
              <Badge key={stroke} variant="secondary" className="gap-1">
                <Waves className="size-3" aria-hidden="true" />
                {strokeLabel(stroke)}
              </Badge>
            ))}
          </div>
        ) : null}
        {session.notes ? (
          <p className="text-sm text-muted-foreground">{session.notes}</p>
        ) : null}
      </CardContent>
      {footer ? (
        <CardFooter className="pt-0">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
