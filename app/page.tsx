import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function Home() {
  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect("/login");
  }
  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (user?.role === "coach") {
    redirect("/coach/dashboard");
  }
  if (user?.role === "student") {
    redirect("/student/dashboard");
  }
  redirect("/login");
}
