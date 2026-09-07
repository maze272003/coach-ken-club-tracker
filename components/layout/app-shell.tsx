"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Database,
  Dumbbell,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOutIcon,
  MenuIcon,
  Target,
  Timer,
  User,
  Users,
  UsersRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type NavIconName =
  | "LayoutDashboard"
  | "Users"
  | "ClipboardCheck"
  | "CalendarClock"
  | "CalendarDays"
  | "Database"
  | "Dumbbell"
  | "FileText"
  | "Gauge"
  | "Target"
  | "Timer"
  | "User"
  | "UsersRound"
  | "BookOpen"
  | "Waves"
  | "dashboard"
  | "students"
  | "attendance"
  | "training"
  | "skills"
  | "goals"
  | "times"
  | "reports"
  | "profile";

const iconMap: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CalendarClock,
  CalendarDays,
  Database,
  Dumbbell,
  FileText,
  Gauge,
  Target,
  Timer,
  User,
  UsersRound,
  BookOpen,
  Waves,
  dashboard: LayoutDashboard,
  students: Users,
  attendance: ClipboardCheck,
  training: CalendarDays,
  skills: Gauge,
  goals: Target,
  times: Timer,
  reports: FileText,
  profile: User,
};

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  exact?: boolean;
  badge?: string | number;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

export type ShellUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

export type AppShellProps = {
  navItems?: NavItem[];
  navGroups?: NavGroup[];
  user: ShellUser;
  children: React.ReactNode;
};

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function NavLinks({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4">
      {groups.map((group, groupIdx) => (
        <div
          key={group.title ?? `group-${groupIdx}`}
          className="flex flex-col gap-1"
        >
          {group.title && (
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 select-none">
              {group.title}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
              const Icon = iconMap[item.icon] ?? LayoutDashboard;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-accent/80 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-150 group-hover:scale-105",
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground/80 group-hover:text-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
                        active
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 px-1 py-1">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105">
        <Waves className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          CoachKen Tracker
        </span>
      </div>
    </Link>
  );
}

function UserFooter({ user }: { user: ShellUser }) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex items-center gap-3 border-t bg-muted/20 px-3 py-3">
      <Avatar className="size-8.5 ring-1 ring-border/50">
        {user.image ? (
          <AvatarImage src={user.image} alt={user.name ?? "User"} />
        ) : null}
        <AvatarFallback className="text-xs font-medium">
          {initials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-foreground">
          {user.name ?? "Account"}
        </p>
        {user.email ? (
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          if (signingOut) return;
          setSigningOut(true);
          void signOut().then(() => {
            router.replace("/login");
          });
        }}
        disabled={signingOut}
        aria-label="Log out"
        title="Log out"
      >
        <LogOutIcon className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function AppShell({
  navItems,
  navGroups,
  user,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups: NavGroup[] = useMemo(() => {
    if (navGroups && navGroups.length > 0) {
      return navGroups;
    }
    if (navItems && navItems.length > 0) {
      return [{ items: navItems }];
    }
    return [];
  }, [navGroups, navItems]);

  return (
    <div className="min-h-svh bg-muted/30">
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background lg:flex"
        aria-label="Sidebar"
      >
        <div className="flex h-14 items-center border-b px-4">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks groups={groups} />
        </div>
        <UserFooter user={user} />
      </aside>

      <div className="flex min-h-svh flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation menu"
              >
                <MenuIcon className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col p-0">
              <SheetHeader className="flex h-14 items-center border-b px-4 text-left">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Navigation menu
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col justify-between overflow-y-auto">
                <div className="px-3 py-3">
                  <NavLinks
                    groups={groups}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
                <UserFooter user={user} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold tracking-tight">
            CoachKen Tracker
          </span>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
