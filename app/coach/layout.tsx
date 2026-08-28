import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const navItems: NavItem[] = [
  { href: "/coach/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
  { href: "/coach/students", label: "Students", icon: "Users" },
  { href: "/coach/groups", label: "Groups", icon: "UsersRound" },
  { href: "/coach/practices", label: "Practices", icon: "CalendarClock" },
  { href: "/coach/times", label: "Times", icon: "Timer" },
  { href: "/coach/attendance", label: "Attendance", icon: "ClipboardCheck" },
  { href: "/coach/training", label: "Training", icon: "Dumbbell" },
  { href: "/coach/skills", label: "Skills", icon: "Gauge" },
  { href: "/coach/goals", label: "Goals", icon: "Target" },

  { href: "/coach/profile", label: "Profile", icon: "User", exact: true },
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
      navItems={navItems}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      {children}
    </AppShell>
  );
}
