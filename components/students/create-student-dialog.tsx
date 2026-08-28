"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/lib/format";

const createStudentSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    status: z.enum(["active", "inactive"]),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  status: "active" | "inactive";
  groupId: string;
  dateOfBirth: string;
  sex: string;
};

const initialState: FormState = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  status: "active",
  groupId: "unassigned",
  dateOfBirth: "",
  sex: "unset",
};

export function CreateStudentDialog({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const createStudent = useAction(api.students.create);
  const [submitting, setSubmitting] = useState(false);
  const groups = useQuery(api.groups.list, {});
  const activeGroups = (groups ?? []).filter((g) => g.status === "active");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(initialState);
    setFieldErrors({});
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const parsed = createStudentSchema.safeParse(form);
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
      await createStudent({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        status: parsed.data.status,
        ...(form.groupId !== "unassigned"
          ? { groupId: form.groupId as never }
          : {}),
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        ...(form.sex !== "unset" ? { sex: form.sex as "M" | "F" } : {}),
      });
      toast.success("Student account created successfully.");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err) {
      setError(
        errorMessage(err, "Unable to create the student. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden="true" />
          Create Student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Student</DialogTitle>
          <DialogDescription>
            Enter the student&apos;s information and set an initial password
            they can use to sign in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={fieldErrors.name !== undefined}
              aria-describedby={fieldErrors.name ? "student-name-error" : undefined}
            />
            {fieldErrors.name ? (
              <p id="student-name-error" className="text-xs text-destructive">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-email">Email</Label>
            <Input
              id="student-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={fieldErrors.email !== undefined}
              aria-describedby={fieldErrors.email ? "student-email-error" : undefined}
            />
            {fieldErrors.email ? (
              <p id="student-email-error" className="text-xs text-destructive">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-password">Temporary password</Label>
            <Input
              id="student-password"
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
              aria-invalid={fieldErrors.password !== undefined}
              aria-describedby={fieldErrors.password ? "student-password-error" : undefined}
            />
            {fieldErrors.password ? (
              <p id="student-password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-confirm">Confirm password</Label>
            <Input
              id="student-confirm"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
              aria-invalid={fieldErrors.confirmPassword !== undefined}
              aria-describedby={fieldErrors.confirm ? "student-confirm-error" : undefined}
            />
            {fieldErrors.confirmPassword ? (
              <p id="student-confirm-error" className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) =>
                update("status", value as "active" | "inactive")
              }
              disabled={submitting}
            >
              <SelectTrigger id="student-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-group">Training group</Label>
            <Select
              value={form.groupId}
              onValueChange={(value) => update("groupId", value)}
              disabled={submitting || groups === undefined}
            >
              <SelectTrigger id="student-group" className="w-full">
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
              <Label htmlFor="student-dob">Date of birth (optional)</Label>
              <Input
                id="student-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="student-sex">Sex (optional)</Label>
              <Select
                value={form.sex}
                onValueChange={(value) => update("sex", value)}
                disabled={submitting}
              >
                <SelectTrigger id="student-sex" className="w-full">
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
              {submitting ? "Creating…" : "Create Student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
