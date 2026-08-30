"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Pencil, Sparkles } from "lucide-react";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AvatarField } from "@/components/shared/avatar-field";
import { errorMessage } from "@/lib/format";
import { generateTemporaryPassword } from "@/lib/password";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  // Either an http(s) link or a Convex storage ID from an upload;
  // "" means the picture was removed. The server validates further.
  image: z.string().max(2048),
  status: z.enum(["active", "inactive"]),
});

export function EditStudentDialog({
  studentId,
  initial,
}: {
  studentId: string;
  initial: {
    name: string;
    status: "active" | "inactive";
    image: string;
    groupId: string | null;
    dateOfBirth: string;
    sex: string;
    parentName: string;
    parentPhone: string;
    parentEmail: string;
    joinedAt: string;
    medicalNotes: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<"active" | "inactive">(initial.status);
  const [image, setImage] = useState(initial.image);
  const [groupId, setGroupId] = useState<string>(initial.groupId ?? "unassigned");
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [sex, setSex] = useState(
    initial.sex === "M" || initial.sex === "F" ? initial.sex : "unset",
  );
  const [parentName, setParentName] = useState(initial.parentName);
  const [parentPhone, setParentPhone] = useState(initial.parentPhone);
  const [parentEmail, setParentEmail] = useState(initial.parentEmail);
  const [joinedAt, setJoinedAt] = useState(initial.joinedAt);
  const [medicalNotes, setMedicalNotes] = useState(initial.medicalNotes);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const update = useMutation(api.students.update);
  const assignStudent = useMutation(api.groups.assignStudent);
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const parsed = profileSchema.safeParse({ name, image, status });
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
    setSubmitting(true);
    try {
      await update({
        studentId: studentId as never,
        name: parsed.data.name,
        status: parsed.data.status,
        // Only send the picture when it changed so a resolved storage
        // URL is never written back over the stored reference.
        ...(image !== initial.image
          ? { image: parsed.data.image === "" ? null : parsed.data.image }
          : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(sex !== "unset" ? { sex: sex as "M" | "F" } : {}),
        ...(parentName ? { parentName } : {}),
        ...(parentPhone ? { parentPhone } : {}),
        ...(parentEmail ? { parentEmail } : {}),
        ...(joinedAt ? { joinedAt } : {}),
        ...(medicalNotes ? { medicalNotes } : {}),
      });
      if (groupId !== (initial.groupId ?? "unassigned")) {
        await assignStudent({
          studentId: studentId as never,
          groupId: groupId === "unassigned" ? null : (groupId as never),
        });
      }
      toast.success("Student updated.");
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      toast.error(
        errorMessage(err, "Unable to update the student. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="size-4" aria-hidden="true" />
          Edit Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
          <DialogDescription>
            Update the swimmer&apos;s profile, group and account status. The
            email address cannot be changed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <AvatarField
            idPrefix="edit-student"
            name={name}
            value={image}
            onChange={setImage}
            disabled={submitting}
            error={fieldErrors.image}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-group">Training group</Label>
            <Select
              value={groupId}
              onValueChange={setGroupId}
              disabled={submitting || groups === undefined}
            >
              <SelectTrigger id="edit-group" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {activeGroups.map((group) => (
                  <SelectItem key={group.groupId} value={group.groupId}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-dob">Date of birth</Label>
              <Input
                id="edit-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-sex">Sex</Label>
              <Select value={sex} onValueChange={setSex} disabled={submitting}>
                <SelectTrigger id="edit-sex" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set</SelectItem>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-joined">Joined team on</Label>
            <Input
              id="edit-joined"
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-parent-name">Parent name</Label>
              <Input
                id="edit-parent-name"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-parent-phone">Parent phone</Label>
              <Input
                id="edit-parent-phone"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-parent-email">Parent email</Label>
            <Input
              id="edit-parent-email"
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-medical">Medical notes (coach only)</Label>
            <Textarea
              id="edit-medical"
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              disabled={submitting}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as "active" | "inactive")
              }
              disabled={submitting}
            >
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function ResetPasswordDialog({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const resetPassword = useAction(api.students.resetPassword);

  function handleAutoGeneratePassword() {
    const generated = generateTemporaryPassword();
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.password;
      delete next.confirmPassword;
      return next;
    });
    toast.info("Generated a secure temporary password.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const parsed = passwordSchema.safeParse({ password, confirmPassword });
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
    setSubmitting(true);
    try {
      await resetPassword({
        studentId: studentId as never,
        password: parsed.data.password,
      });
      toast.success("Password updated. The student was signed out everywhere.");
      setOpen(false);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setSubmitting(false);
    } catch (err) {
      toast.error(
        errorMessage(err, "Unable to reset the password. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPassword("");
          setConfirmPassword("");
          setShowPassword(false);
          setFieldErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRound className="size-4" aria-hidden="true" />
          Reset Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for this student. Their existing sessions will
            be signed out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reset-password">New password</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-primary gap-1 hover:text-primary"
                disabled={submitting}
                onClick={handleAutoGeneratePassword}
              >
                <Sparkles className="size-3" aria-hidden="true" />
                Auto-generate
              </Button>
            </div>
            <div className="relative">
              <Input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="pr-10"
                aria-invalid={fieldErrors.password !== undefined}
                aria-describedby={
                  fieldErrors.password ? "reset-password-error" : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.password ? (
              <p id="reset-password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-confirm">Confirm password</Label>
            <div className="relative">
              <Input
                id="reset-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                className="pr-10"
                aria-invalid={fieldErrors.confirmPassword !== undefined}
                aria-describedby={
                  fieldErrors.confirmPassword ? "reset-confirm-error" : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.confirmPassword ? (
              <p id="reset-confirm-error" className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Set Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
