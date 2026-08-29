import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/**
 * The documentation page is available to every signed-in user (coach and
 * student). Unauthenticated visitors are sent to the login page.
 */
export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect("/login");
  }
  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user || (user.role !== "coach" && user.role !== "student")) {
    redirect("/");
  }
  return children;
}
