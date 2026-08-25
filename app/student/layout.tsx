import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const navItems: NavItem[] = [
  { href: "/student/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
  { href: "/student/attendance", label: "Attendance", icon: "ClipboardCheck" },
  { href: "/student/training", label: "Training Sessions", icon: "CalendarDays" },
  { href: "/student/skills", label: "Skills", icon: "Gauge" },
  { href: "/student/goals", label: "Goals", icon: "Target" },
  { href: "/student/profile", label: "Profile", icon: "User", exact: true },
];

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect("/login");
  }
  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user || user.role !== "student") {
    redirect("/");
  }
  return (
    <AppShell
      navItems={navItems}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      {children}
    </AppShell>
  );
}
