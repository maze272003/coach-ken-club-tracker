"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ClipboardCheck, Gauge, Pencil } from "lucide-react";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { AvatarField } from "@/components/shared/avatar-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, formatDate } from "@/lib/format";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  // Either an http(s) link or a Convex storage ID from an upload;
  // "" means the picture was removed. The server validates further.
  image: z.string().max(2048),
});

export default function StudentProfilePage() {
  const profile = useQuery(api.students.myProfile, {});
  const summary = useQuery(api.dashboard.studentDashboard, {});

  const [form, setForm] = useState<{
    name?: string;
    image?: string;
  }>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const updateProfile = useMutation(api.students.updateOwnProfile);

  const name = form.name ?? profile?.name ?? "";
  const image = form.image ?? profile?.image ?? "";

  function setName(value: string) {
    setForm((prev) => ({ ...prev, name: value }));
  }
  function setImage(value: string) {
    setForm((prev) => ({ ...prev, image: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !profile) return;
    setError(null);
    const parsed = profileSchema.safeParse({ name, image });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      await updateProfile({
        name: parsed.data.name,
        // Only send the picture when it changed so a resolved storage
        // URL is never written back over the stored reference.
        ...(image !== (profile.image ?? "")
          ? { image: parsed.data.image === "" ? null : parsed.data.image }
          : {}),
      });
      toast.success("Profile updated.");
      setSaving(false);
    } catch (err) {
      setError(errorMessage(err, "Unable to save your profile. Please try again."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your account information." />

      {profile === undefined || summary === undefined ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : profile === null ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Your email and account status are managed by your coach.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <StudentAvatar
                  name={profile.name}
                  image={profile.image}
                  className="size-14"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{profile.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {profile.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <Badge
                  variant={profile.status === "active" ? "default" : "secondary"}
                >
                  {profile.status === "active" ? "Active" : "Inactive"}
                </Badge>
                <span className="text-muted-foreground">
                  Member since{" "}
                  {new Date(profile.createdAtMs).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4 border-t pt-4"
                noValidate
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Edit display name &amp; avatar
                </h3>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-name">Display name</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                  />
                  {fieldErrors.name ? (
                    <p className="text-xs text-destructive">{fieldErrors.name}</p>
                  ) : null}
                </div>
                <AvatarField
                  idPrefix="student-profile"
                  name={name}
                  value={image}
                  onChange={setImage}
                  disabled={saving}
                  error={fieldErrors.image}
                />
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Training Summary
            </h2>
            <Card>
              <CardHeader>
                <CardTitle>Athlete Info</CardTitle>
                <CardDescription>Managed by your coach.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {profile.dateOfBirth ? (
                  <span>Born {formatDate(profile.dateOfBirth)}</span>
                ) : null}
                {profile.sex ? (
                  <span>{profile.sex === "M" ? "Male" : "Female"}</span>
                ) : null}
                {profile.joinedAt ? (
                  <span>Joined team {formatDate(profile.joinedAt)}</span>
                ) : null}
                {!profile.dateOfBirth && !profile.sex && !profile.joinedAt ? (
                  <span className="text-muted-foreground">
                    No athlete details recorded yet.
                  </span>
                ) : null}
              </CardContent>
            </Card>
            <StatCard
              icon={ClipboardCheck}
              label="Attendance"
              value={
                summary.attendance.percentage === null
                  ? "—"
                  : `${summary.attendance.percentage}%`
              }
              hint={
                summary.attendance.total === 0
                  ? "No sessions recorded yet"
                  : `${summary.attendance.attended} of ${summary.attendance.total} days attended`
              }
            />
            <StatCard
              icon={Gauge}
              label="Overall Training Progress"
              value={
                summary.overallProgress === null
                  ? "—"
                  : `${summary.overallProgress}%`
              }
              hint={
                summary.overallProgress === null
                  ? "No progress recorded yet"
                  : "Average across your skills"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
