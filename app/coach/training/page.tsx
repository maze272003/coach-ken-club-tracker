"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CalendarDays, Clock, Dumbbell, Waves } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SessionFormDialog } from "@/components/coach/session-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, strokeLabel } from "@/lib/format";

export default function CoachTrainingPage() {
  const sessions = useQuery(api.training.listRecent, { limit: 50 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description="Training sessions recorded across all swimmers."
        actions={<SessionFormDialog triggerLabel="New Session" />}
      />

      {sessions === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No training sessions yet"
          description="Record a training session to start tracking what your swimmers work on."
        />
      ) : (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {sessions.map((session) => (
                <li
                  key={session.sessionId}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/coach/students/${session.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {session.studentName}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        {session.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {formatDate(session.date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {session.durationMinutes} min
                      </span>
                    </div>
                    {session.strokes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {session.strokes.map((stroke) => (
                          <Badge
                            key={stroke}
                            variant="secondary"
                            className="gap-1"
                          >
                            <Waves className="size-3" aria-hidden="true" />
                            {strokeLabel(stroke)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {session.notes ? (
                      <p className="text-sm text-muted-foreground">
                        {session.notes}
                      </p>
                    ) : null}
                  </div>
                  <SessionFormDialog
                    sessionId={session.sessionId}
                    fixedStudentId={session.studentId}
                    initial={{
                      studentId: session.studentId,
                      date: session.date,
                      title: session.title,
                      durationMinutes: String(session.durationMinutes),
                      strokes: session.strokes,
                      notes: session.notes ?? "",
                    }}
                    triggerLabel="Edit"
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
