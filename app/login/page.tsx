"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { Waves } from "lucide-react";
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

function friendlyAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (
    message.includes("invalid email or password") ||
    message.includes("invalid credentials") ||
    message.includes("password")
  ) {
    return "Incorrect email or password. Please try again.";
  }
  return "Unable to sign in right now. Please try again.";
}

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: "signIn",
      });
      router.replace("/");
    } catch (err) {
      toast.error(friendlyAuthError(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Waves className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            CoachKen Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Swimmer training &amp; progress tracking
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email and password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Student accounts are created by your coach.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
