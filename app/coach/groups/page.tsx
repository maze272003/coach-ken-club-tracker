"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, UsersRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { GroupFormDialog } from "@/components/coach/group-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/format";

export default function CoachGroupsPage() {
  const groups = useQuery(api.groups.list, {});
  const setStatus = useMutation(api.groups.setStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleArchive(groupId: string, next: "active" | "archived") {
    if (busyId !== null) return;
    setError(null);
    setBusyId(groupId);
    try {
      await setStatus({ groupId: groupId as never, status: next });
      toast.success(
        next === "archived" ? "Group archived." : "Group reactivated.",
      );
      setBusyId(null);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to update the group. Please try again."),
      );
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Training groups for planning practices and roll call."
        actions={<GroupFormDialog mode="create" />}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent>
          {groups === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No groups yet"
              description="Create your first training group, e.g. Development or Competitive."
            />
          ) : (
            <ul className="divide-y">
              {groups.map((group) => (
                <li
                  key={group.groupId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{group.name}</span>
                      {group.status === "archived" ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : null}
                    </div>
                    {group.description ? (
                      <p className="max-w-xl truncate text-sm text-muted-foreground">
                        {group.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                    </span>
                    {group.status === "active" ? (
                      <GroupFormDialog
                        mode="edit"
                        group={{
                          groupId: group.groupId,
                          name: group.name,
                          description: group.description,
                        }}
                      />
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId !== null}
                      onClick={() =>
                        void toggleArchive(
                          group.groupId,
                          group.status === "active" ? "archived" : "active",
                        )
                      }
                    >
                      {group.status === "active" ? (
                        <>
                          <Archive className="size-4" aria-hidden="true" />
                          Archive
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="size-4" aria-hidden="true" />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
