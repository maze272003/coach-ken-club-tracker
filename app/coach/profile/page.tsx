"use client";

import { useQuery } from "convex/react";
import { KeyRound, Mail, ShieldCheck, Waves } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentAvatar } from "@/components/shared/student-avatar";

export default function CoachProfilePage() {
  const user = useQuery(api.users.currentUser, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your coach account information."
      />

      {user === undefined ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : user === null ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <Card className="max-w-xl">
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <StudentAvatar
                name={user.name}
                image={user.image}
                className="size-14"
              />
              <div>
                <p className="font-semibold">{user.name ?? "Coach"}</p>
                <p className="text-sm text-muted-foreground">
                  Coach &amp; account administrator
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">Email:</span> {user.email ?? "—"}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">Role:</span> Coach
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Coach credentials are configured with server-side
                  environment variables (<code>COACH_EMAIL</code> /{" "}
                  <code>COACH_PASSWORD</code>). They are never exposed to the
                  browser and cannot be changed from this app.
                </span>
              </p>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Waves className="size-3.5" aria-hidden="true" />
              CoachKen Tracker — swimmer training &amp; progress tracking
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
