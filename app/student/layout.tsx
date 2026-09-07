import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell, type NavGroup } from "@/components/layout/app-shell";

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/student/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
    ],
  },
  {
    title: "Training & Progress",
    items: [
      { href: "/student/attendance", label: "Attendance", icon: "ClipboardCheck" },
      { href: "/student/training", label: "Training Sessions", icon: "CalendarDays" },
      { href: "/student/times", label: "Times & PBs", icon: "Timer" },
      { href: "/student/skills", label: "Skills", icon: "Gauge" },
      { href: "/student/goals", label: "Goals", icon: "Target" },
    ],
  },
  {
    title: "Account & Docs",
    items: [
      { href: "/docs", label: "User Guide", icon: "BookOpen" },
      { href: "/student/profile", label: "Profile", icon: "User", exact: true },
    ],
  },
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
      navGroups={navGroups}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      {children}
    </AppShell>
  );
}
