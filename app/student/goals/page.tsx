"use client";

import { useQuery } from "convex/react";
import { Target } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { GoalCard } from "@/components/shared/goal-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentGoalsPage() {
  const goals = useQuery(api.goals.my, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="Training goals assigned by your coach."
      />

      {goals === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Your coach hasn't assigned a training goal."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal._id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}
