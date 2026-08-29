// app/student/training/page.tsx
"use client";

import { useQuery } from "convex/react";
import { CalendarDays } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TrainingSessionCard } from "@/components/shared/training-session-card";
import { MyTrendsSection } from "@/components/student/my-trends-section";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentTrainingPage() {
  const sessions = useQuery(api.training.mySessions, { limit: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Sessions"
        description="Your complete training history."
      />

      <MyTrendsSection />

      {sessions === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No training sessions yet"
          description="Your coach hasn't recorded any sessions."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.map((session) => (
            <TrainingSessionCard key={session._id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
