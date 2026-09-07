import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell, type NavGroup } from "@/components/layout/app-shell";

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/coach/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
    ],
  },
  {
    title: "Squad & Roster",
    items: [
      { href: "/coach/students", label: "Students", icon: "Users" },
      { href: "/coach/groups", label: "Groups", icon: "UsersRound" },
      { href: "/coach/attendance", label: "Attendance", icon: "ClipboardCheck" },
    ],
  },
  {
    title: "Training & Performance",
    items: [
      { href: "/coach/practices", label: "Practices", icon: "CalendarClock" },
      { href: "/coach/training", label: "Training Sessions", icon: "Dumbbell" },
      { href: "/coach/times", label: "Times & Trials", icon: "Timer" },
      { href: "/coach/skills", label: "Skills", icon: "Gauge" },
      { href: "/coach/goals", label: "Goals", icon: "Target" },
    ],
  },
  {
    title: "Insights & Reports",
    items: [
      { href: "/coach/reports", label: "Weekly Reports", icon: "FileText" },
      { href: "/coach/data", label: "Data Overview", icon: "Database" },
    ],
  },
  {
    title: "Account & Docs",
    items: [
      { href: "/docs", label: "User Guide", icon: "BookOpen" },
      { href: "/coach/profile", label: "Profile", icon: "User", exact: true },
    ],
  },
];

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect("/login");
  }
  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user || user.role !== "coach") {
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
