"use client";

import { useQuery } from "convex/react";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressRow } from "@/components/shared/progress-row";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { strokeLabel } from "@/lib/format";

export default function StudentSkillsPage() {
  const skills = useQuery(api.skills.my, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        description="Your stroke skill progress, updated by your coach."
      />

      {skills === undefined ? (
        <Card>
          <CardContent className="space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : skills.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No skills recorded yet"
          description="Your coach will record your stroke progress here."
        />
      ) : (
        <Card>
          <CardContent className="space-y-5">
            {skills.map((skill) => (
              <ProgressRow
                key={skill.stroke}
                label={strokeLabel(skill.stroke)}
                value={skill.progress}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
